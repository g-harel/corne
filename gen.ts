import * as fs from "fs";

import {Key, Keyboard, Serial} from "@ijprest/kle-serial";
import * as c from "color";
import * as glob from "glob";

// TODO svg?
// TODO rotation
// TODO padding
// TODO metadata
// TODO optional size decoration

export class Element {
    private attributes: Record<string, string | number> = {};
    private styles: Record<string, string | number> = {};
    private children: any[] = [];

    public constructor(public tag: string) {}

    public attr(key: string, value: string | number): Element {
        this.attributes[key] = value;
        return this;
    }

    public style(key: string, value: string | number): Element {
        this.styles[key] = value;
        return this;
    }

    public child(element: Element | string): Element {
        if (typeof element === "string") {
            this.children.push({render: () => element});
        } else {
            this.children.push(element);
        }
        return this;
    }

    public render(): string {
        const attributes = this.renderAttributes();
        const content = this.renderChildren();
        if (content === "") {
            return `<${this.tag}${attributes}/>`;
        }
        return `<${this.tag}${attributes}>${content}</${this.tag}>`;
    }

    private renderAttributes(): string {
        let styleOut = "";
        const styles = Object.keys(this.styles);
        for (const style of styles) {
            styleOut += `${style}:${this.styles[style]};`;
        }
        let out = "";
        if (styleOut.length > 0) {
            out += ` style="${styleOut}"`;
        }
        const attributes = Object.keys(this.attributes);
        for (const attribute of attributes) {
            out += ` ${attribute}="${this.attributes[attribute]}"`;
        }
        return out;
    }

    private renderChildren(): string {
        let out = "";
        for (const child of this.children) {
            out += child.render();
        }
        return out;
    }
}

// Layout
const PIXEL_WIDTH = 1200;
const LAYOUT_PADDING = 0.4; // TODO

// Colors
const KEY_STROKE_DARKEN = 0.7;
const KEY_SHINE_DIFF = 0.15;

// Sizes
const KEY = 1;
const KEY_RADIUS = KEY * 0.1;
const KEY_STROKE_WIDTH = KEY * 0.015;
const SHINE_PADDING_TOP = KEY * 0.05;
const SHINE_PADDING_SIDE = KEY * 0.12;
const SHINE_PADDING_BOTTOM = KEY * 0.2;
const FONT_UNIT = KEY * 0.033;
const LINE_HEIGHT = FONT_UNIT * 4;
const SHINE_PADDING = KEY * 0.05;

const render2 = (keyboard: Keyboard): string => {
    // TODO care about rotation.
    const maxUnits: {x: number; y: number} = keyboard.keys.reduce(
        (max, key) => {
            max.x = Math.max(max.x, key.x + key.width);
            max.x = Math.max(max.x, key.x + key.x2 + key.width2);
            max.y = Math.max(max.y, key.y + key.height);
            max.y = Math.max(max.y, key.y + key.y2 + key.height2);
            return max;
        },
        {x: 0, y: 0},
    );

    const parent = new Element("svg")
        .attr("viewBox", `0 0 ${maxUnits.x} ${maxUnits.y}`)
        .attr("width", PIXEL_WIDTH)
        .attr("height", (PIXEL_WIDTH * maxUnits.y) / maxUnits.x);

    keyboard.keys.forEach((k) => {
        const xRotOrigin = ((k.rotation_x || 0) / maxUnits.x) * 100 + "%";
        const yRotOrigin = ((k.rotation_y || 0) / maxUnits.y) * 100 + "%";
        parent.child(
            new Element("circle")
                .attr("cx", xRotOrigin)
                .attr("cy", yRotOrigin)
                .attr("r", 0.05)
                .attr("fill", k.color),
        );

        // TODO front face labels (hardcode row/col values)
        const text = new Element("g");
        k.labels.forEach((label, i) => {
            const size = k.textSize[i] || k.default.textSize;

            const shineWidth = k.width - 2 * SHINE_PADDING_SIDE;
            const xOffset = i % 3;
            const xOffsets = [
                SHINE_PADDING_SIDE + SHINE_PADDING,
                SHINE_PADDING_SIDE + shineWidth / 2,
                SHINE_PADDING_SIDE + shineWidth - SHINE_PADDING,
            ];

            const shineHeight =
                k.height - SHINE_PADDING_TOP - SHINE_PADDING_BOTTOM;
            const yOffset = Math.floor(i / 3);
            const yOffsets = [
                SHINE_PADDING_TOP + LINE_HEIGHT + SHINE_PADDING,
                SHINE_PADDING_TOP + shineHeight / 2 + LINE_HEIGHT / 2,
                SHINE_PADDING_TOP + shineHeight - SHINE_PADDING,
                k.height,
            ];

            const xPos = xOffsets[xOffset];
            const yPos = yOffsets[yOffset];
            const anchor =
                xOffset == 0 ? "start" : xOffset == 1 ? "middle" : "end";

            text.child(
                new Element("text")
                    .style("font-size", 3 * FONT_UNIT + FONT_UNIT * size)
                    .style("fill", k.textColor[i] || k.default.textColor)
                    .attr("x", xPos)
                    .attr("y", yPos)
                    .attr("text-anchor", anchor)
                    .attr("font-family", "Arial, Helvetica, sans-serif")
                    .child(label.replace("<", "&lt;")),
            );
        });

        parent.child(
            new Element("g")
                .style(
                    "transform",
                    `rotate(${k.rotation_angle}deg) translate(${k.x}px, ${k.y}px)`,
                )
                // .style("transform-origin", `${xRotOrigin} ${yRotOrigin}`)
                // .style("transform-box", "view-box")
                .child(
                    new Element("rect")
                        .style("fill", k.color)
                        .style(
                            "stroke",
                            c(k.color).darken(KEY_STROKE_DARKEN).hex(),
                        )
                        .style("stroke-width", KEY_STROKE_WIDTH)
                        .attr("rx", KEY_RADIUS)
                        .attr("width", KEY * k.width)
                        .attr("height", KEY * k.height),
                )
                .child(
                    new Element("rect")
                        .style("fill", c(k.color).lighten(KEY_SHINE_DIFF).hex())
                        .style(
                            "stroke",
                            c(k.color).darken(KEY_SHINE_DIFF).hex(),
                        )
                        .style("stroke-width", KEY_STROKE_WIDTH)
                        .attr("x", SHINE_PADDING_SIDE)
                        .attr("y", SHINE_PADDING_TOP)
                        .attr("rx", KEY_RADIUS)
                        .attr("width", KEY * k.width - 2 * SHINE_PADDING_SIDE)
                        .attr(
                            "height",
                            KEY * k.height -
                                SHINE_PADDING_TOP -
                                SHINE_PADDING_BOTTOM,
                        ),
                )
                .child(text),
        );
    });

    return parent.render();
};

const outFile = glob
    .sync("kle/**/*.json")
    .map((path) => {
        console.log(path);
        return path;
    })
    .map((path) => fs.readFileSync(path).toString())
    .map((contents) => Serial.parse(contents))
    .map(render2)
    .join("\n");

fs.writeFileSync(".out.html", outFile);

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

// Colors
const KEY_STROKE_DARKEN = 0.7;
const KEY_SHINE_DIFF = 0.15;

// Sizes
const PIXEL_WIDTH = 1200;
const KEY = 1;
const LAYOUT_PADDING = KEY * 0.1;
const KEY_RADIUS = KEY * 0.1;
const KEY_STROKE_WIDTH = KEY * 0.015;
const SHINE_PADDING_TOP = KEY * 0.05;
const SHINE_PADDING_SIDE = KEY * 0.12;
const SHINE_PADDING_BOTTOM = KEY * 0.2;
const FONT_UNIT = KEY * 0.033;
const LINE_HEIGHT = FONT_UNIT * 4;
const SHINE_PADDING = KEY * 0.05;

const render2 = (keyboard: Keyboard): string => {
    // TODO make optional
    for (const key of keyboard.keys) {
        key.x += LAYOUT_PADDING;
        key.x2 += LAYOUT_PADDING;
        key.y += LAYOUT_PADDING;
        key.y2 += LAYOUT_PADDING;
        key.rotation_x += LAYOUT_PADDING;
        key.rotation_y += LAYOUT_PADDING;
    }

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

    const viewHeight = KEY * maxUnits.x + LAYOUT_PADDING;
    const viewWidth = KEY * maxUnits.y + LAYOUT_PADDING;
    const parent = new Element("svg")
        .attr("viewBox", `0 0 ${viewHeight} ${viewWidth}`)
        .attr("width", PIXEL_WIDTH)
        .attr("height", (PIXEL_WIDTH * maxUnits.y) / maxUnits.x);

    keyboard.keys.forEach((k) => {
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
                    .child(label.replace(/<.*\/?>/g, "")),
            );
        });

        const cap = new Element("rect")
            .style("fill", k.color)
            .style("stroke", c(k.color).darken(KEY_STROKE_DARKEN).hex())
            .style("stroke-width", KEY_STROKE_WIDTH)
            .attr("rx", KEY_RADIUS)
            .attr("width", KEY * (k.stepped ? k.width2 : k.width))
            .attr("height", KEY * (k.stepped ? k.height2 : k.height));

        const shine = new Element("rect")
            .style("fill", c(k.color).lighten(KEY_SHINE_DIFF).hex())
            .style("stroke", c(k.color).darken(KEY_SHINE_DIFF).hex())
            .style("stroke-width", KEY_STROKE_WIDTH)
            .attr("x", SHINE_PADDING_SIDE)
            .attr("y", SHINE_PADDING_TOP)
            .attr("rx", KEY_RADIUS)
            .attr("width", KEY * k.width - 2 * SHINE_PADDING_SIDE)
            .attr(
                "height",
                KEY * k.height - SHINE_PADDING_TOP - SHINE_PADDING_BOTTOM,
            );

        // TODO rotate correctly when not 0,0 origin
        let key: Element;
        if (k.rotation_angle) {
            parent.child(
                new Element("circle")
                    .attr("cx", k.rotation_x)
                    .attr("cy", k.rotation_y)
                    .attr("r", 0.05)
                    .attr("fill", k.color),
            );
            key = new Element("g")
                .style(
                    "transform-origin",
                    `${k.rotation_x}px ${k.rotation_y}px`,
                )
                .style(
                    "transform",
                    `translate(${k.x}px, ${k.y}px) rotate(${k.rotation_angle}deg)`,
                );
        } else {
            key = new Element("g").style(
                "transform",
                `translate(${k.x}px, ${k.y}px)`,
            );
        }

        if (!k.decal) {
            key.child(cap);
            key.child(shine);
        }
        if (!k.ghost) {
            key.child(text);
        } else {
            key.attr("opacity", 0.5);
        }

        parent.child(key);
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

const ot =
    `

<svg width="200" height="200">
    <g style="transform:translate(0,0)rotate(0deg);">
        <rect style="fill:red" width="20" height="20"></rect>
    </g>
    <g style="transform:translate(0,0)rotate(30deg);">
        <rect style="fill:green" width="20" height="20"></rect>
    </g>
    <g style="transform:translate(0,0)rotate(-30deg);">
        <rect style="fill:blue" width="20" height="20"></rect>
    </g>

    <g style="transform:translate(30px,30px)rotate(0deg);">
        <rect style="fill:red" width="20" height="20"></rect>
    </g>
    <g style="transform:translate(30px,30px)rotate(30deg);">
        <rect style="fill:green" width="20" height="20"></rect>
    </g>
    <g style="transform:translate(30px,30px)rotate(-30deg);">
         <rect style="fill:blue" width="20" height="20"></rect>
    </g>

    <g style="transform:rotate(0deg)translate(30px,30px);">
        <rect style="fill:red" width="20" height="20"></rect>
    </g>
    <g style="transform:rotate(30deg)translate(30px,30px);">
        <rect style="fill:green" width="20" height="20"></rect>
    </g>
    <g style="transform:rotate(-30deg)translate(30px,30px);">
         <rect style="fill:blue" width="20" height="20"></rect>
    </g>
</svg>

` + outFile;

fs.writeFileSync(".out.html", ot);

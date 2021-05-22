import * as fs from "fs";

import {Key, Keyboard, Serial} from "@ijprest/kle-serial";
import * as c from "color";
import * as glob from "glob";

// TODO svg?
// TODO rotation
// TODO padding
// TODO metadata
// TODO optional size decoration

interface Coord {
    x: number;
    y: number;
}

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
const KEY_RADIUS = 0.1;
const KEY_STROKE_WIDTH = 0.015;
const LAYOUT_PADDING = KEY_STROKE_WIDTH / 2;
const SHINE_PADDING_TOP = 0.05;
const SHINE_PADDING_SIDE = 0.12;
const SHINE_PADDING_BOTTOM = 0.2;
const FONT_UNIT = 0.033;
const LINE_HEIGHT = FONT_UNIT * 4;
const SHINE_PADDING = 0.05;

// Key's position is P and the rotation origin is R.
const rotateCoord = (p: Coord, r: Coord, a: number): Coord => {
    if (a === 0) return p;
    const distanceRtoP = Math.sqrt((p.x - r.x) ** 2 + (p.y - r.y) ** 2);
    const angleRtoP = Math.acos((p.x - r.x) / distanceRtoP);
    const finalAngle = angleRtoP + a * (Math.PI / 180);
    const xOffsetRtoP = distanceRtoP * Math.cos(finalAngle);
    const yOffsetRtoP = distanceRtoP * Math.sin(finalAngle);
    return {x: r.x + xOffsetRtoP, y: r.y + yOffsetRtoP};
};

const moveAll = (keyboard: Keyboard, x: number, y: number) => {
    for (const key of keyboard.keys) {
        key.x += x;
        key.x2 += x;
        key.rotation_x += x;
        key.y += y;
        key.y2 += y;
        key.rotation_y += y;
    }
};

const render = (keyboard: Keyboard): string => {
    let max: Coord = {x: 0, y: 0};
    let min: Coord = {x: Infinity, y: Infinity};
    for (const k of keyboard.keys) {
        const coords: Coord[] = [];
        coords.push({x: k.x, y: k.y});
        coords.push({x: k.x, y: k.y + k.height});
        coords.push({x: k.x + k.width, y: k.y + k.height});
        coords.push({x: k.x + k.width, y: k.y});
        coords.push({x: k.x + k.x2, y: k.y + k.y2});
        coords.push({x: k.x + k.x2, y: k.y + k.y2 + k.height2});
        coords.push({x: k.x + k.x2 + k.width2, y: k.y + k.y2 + k.height2});
        coords.push({x: k.x + k.x2 + k.width2, y: k.y + k.y2});

        const r: Coord = {x: k.rotation_x, y: k.rotation_y};
        const rotated: Coord[] = coords.map((c) => {
            return rotateCoord(c, r, k.rotation_angle);
        });

        max = {
            x: Math.max(max.x, ...rotated.map((c) => c.x)),
            y: Math.max(max.y, ...rotated.map((c) => c.y)),
        };
        min = {
            x: Math.min(min.x, ...rotated.map((c) => c.x)),
            y: Math.min(min.y, ...rotated.map((c) => c.y)),
        };
    }

    // Shrink coordinates to top-left + layout padding.
    moveAll(keyboard, -min.x + LAYOUT_PADDING, -min.y + LAYOUT_PADDING);

    const viewHeight = max.x - min.x + 2 * LAYOUT_PADDING;
    const viewWidth = max.y - min.y + 2 * LAYOUT_PADDING;
    const parent = new Element("svg")
        .attr("viewBox", `0 0 ${viewHeight} ${viewWidth}`)
        .attr("width", PIXEL_WIDTH)
        .attr("height", PIXEL_WIDTH * (viewWidth / viewHeight));

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
            .attr("width", k.stepped ? k.width2 : k.width)
            .attr("height", k.stepped ? k.height2 : k.height);

        const shine = new Element("rect")
            .style("fill", c(k.color).lighten(KEY_SHINE_DIFF).hex())
            .style("stroke", c(k.color).darken(KEY_SHINE_DIFF).hex())
            .style("stroke-width", KEY_STROKE_WIDTH)
            .attr("x", SHINE_PADDING_SIDE)
            .attr("y", SHINE_PADDING_TOP)
            .attr("rx", KEY_RADIUS)
            .attr("width", k.width - 2 * SHINE_PADDING_SIDE)
            .attr(
                "height",
                k.height - SHINE_PADDING_TOP - SHINE_PADDING_BOTTOM,
            );

        let key: Element;
        if (k.rotation_angle) {
            const r = rotateCoord(
                k,
                {x: k.rotation_x, y: k.rotation_y},
                k.rotation_angle,
            );
            key = new Element("g")
                .style(
                    "transform",
                    `rotate(${k.rotation_angle}deg)translate(${r.x}px,${r.y}px)`,
                )
                .style("transform-origin", `${r.x}px ${r.y}px`);
        } else {
            key = new Element("g").style(
                "transform",
                `translate(${k.x}px,${k.y}px)`,
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
    .map(render)
    .join("\n");

fs.writeFileSync(".out.html", outFile);

import * as fs from "fs";

import {Keyboard, Serial} from "@ijprest/kle-serial";
import * as c from "color";
import * as glob from "glob";

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

const PIXEL_WIDTH = 838;
const KEY_RADIUS = 0.1;
const KEY_STROKE_WIDTH = 0.015;
const LAYOUT_PADDING = KEY_STROKE_WIDTH / 2 + 0.2;
const STROKE_COLOR_DARKEN = 0.7;

const SHINE_PADDING_TOP = 0.05;
const SHINE_PADDING_SIDE = 0.12;
const SHINE_PADDING_BOTTOM = 0.2;
const SHINE_PADDING = 0.05;
const SHINE_COLOR_DIFF = 0.15;

const FONT_UNIT = 0.033;
const LINE_HEIGHT = FONT_UNIT * 4;

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

const sanitizeLabel = (label: string) => {
    return label.replace(/[&<>]/g, (s) => {
        switch(s) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
        }
    });
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

    // Add size in the bottom right if key is wider than 1u.
    for (const key of keyboard.keys) {
        const width = key.stepped ? key.width2 : key.width;
        if (width !== 1 && key.labels[8] == undefined) {
            console.log(key.labels);
            while (key.labels.length < 9) key.labels.push("");
            key.labels[8] = String(width);
        }
    }

    const viewWidth = max.x - min.x + 2 * LAYOUT_PADDING;
    const viewHeight = max.y - min.y + 2 * LAYOUT_PADDING + LINE_HEIGHT + 2 * SHINE_PADDING;
    const parent = new Element("svg")
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
        .attr("width", PIXEL_WIDTH)
        .attr("height", PIXEL_WIDTH * (viewHeight / viewWidth));

    // Add keyboard info line.
    parent.child(
        new Element("text")
            .style("font-size", 6 * FONT_UNIT)
            .attr("x", LAYOUT_PADDING + SHINE_PADDING)
            .attr("y", viewHeight - SHINE_PADDING - LAYOUT_PADDING)
            .attr("font-family", "Arial, Helvetica, sans-serif")
            .attr("font-style", "italic")
            .child(`${keyboard.meta.name} | ${keyboard.keys.length} keys`),
    );

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
                    .child(sanitizeLabel(label)),
            );
        });

        const cap = new Element("rect")
            .style("fill", k.color)
            .style("stroke", c(k.color).darken(STROKE_COLOR_DARKEN).hex())
            .style("stroke-width", KEY_STROKE_WIDTH)
            .attr("rx", KEY_RADIUS)
            .attr("width", k.stepped ? k.width2 : k.width)
            .attr("height", k.stepped ? k.height2 : k.height);

        const shine = new Element("rect")
            .style("fill", c(k.color).lighten(SHINE_COLOR_DIFF).hex())
            .style("stroke", c(k.color).darken(SHINE_COLOR_DIFF).hex())
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
                    `rotate(${k.rotation_angle}deg)` +
                        `translate(${r.x}px,${r.y}px)`,
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

const genOut = () => {
    const paths = glob.sync("kle/**/*.json");

    const svgPaths: string[] = [];
    for (const path of paths) {
        console.log(path);
        const rendered = render(Serial.parse(fs.readFileSync(path).toString()));
        const svgPath = path.replace(/\.json$/g, ".svg");
        fs.writeFileSync(svgPath, rendered);
        svgPaths.push(svgPath);
    }

    let readmeContents = "";
    for (const svgPath of svgPaths) {
        readmeContents += `![](${svgPath})\n\n`;
    }
    fs.writeFileSync("README.md", readmeContents);

    let outContents = "";
    for (const svgPath of svgPaths) {
        outContents += `<img src="${svgPath}"/>\n`;
    }
    fs.writeFileSync(".out.html", outContents);
};

genOut();

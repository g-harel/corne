import * as fs from "fs";

import {Key, Keyboard, Serial} from "@ijprest/kle-serial";
import * as glob from "glob";
import {createCanvas, Canvas} from "canvas";

// TODO svg?
// TODO rotation
// TODO padding
// TODO metadata
// TODO optional size decoration

const PIXEL_WIDTH = 800;

const KEY_PADDING_TOP = 0.05;
const KEY_PADDING_SIDE = 0.15;
const KEY_PADDING_BOTTOM = 0.2;

const PT = 4;
const PH = PT / 2;
const PQ = PH / 2;
const KEY_RADIUS = 0.06;

const DEFAULT_KEY_COLOR = "#cccccc";
const DEFAULT_STROKE_COLOR = "#000000";
const DEFAULT_KEY_OVERLAY_COLOR = "#FFFFFF66";
const DEFAULT_KEY_OVERLAY_STROKE_COLOR = "#00000022";

// https://stackoverflow.com/a/7838871/3053361
const renderRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) => {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
};

const renderKey = (
    key: Key,
    ctx: CanvasRenderingContext2D,
    unitRatio: number,
) => {
    const x = key.x * unitRatio;
    const y = key.y * unitRatio;
    const w = key.width * unitRatio;
    const h = key.height * unitRatio;

    const innerX = (key.x + KEY_PADDING_SIDE) * unitRatio;
    const innerY = (key.y + KEY_PADDING_TOP) * unitRatio;
    const innerW = (key.width - 2 * KEY_PADDING_SIDE) * unitRatio;
    const innerH =
        (key.height - KEY_PADDING_TOP - KEY_PADDING_BOTTOM) * unitRatio;

    const keyRadius = KEY_RADIUS * unitRatio;

    ctx.fillStyle = key.color || DEFAULT_KEY_COLOR;
    ctx.lineWidth = PT;
    ctx.strokeStyle = DEFAULT_STROKE_COLOR;
    renderRoundRect(ctx, x + PQ, y + PQ, w - PH, h - PH, keyRadius);

    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = DEFAULT_KEY_OVERLAY_COLOR;
    ctx.lineWidth = PT;
    ctx.strokeStyle = DEFAULT_KEY_OVERLAY_STROKE_COLOR;
    renderRoundRect(ctx, innerX, innerY, innerW, innerH, keyRadius);
    ctx.globalCompositeOperation = "source-over";
};

const renderKeyboard = (keyboard: Keyboard): Canvas => {
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

    const canvasHeight = (PIXEL_WIDTH * maxUnits.y) / maxUnits.x;
    const unitRatio = PIXEL_WIDTH / maxUnits.x;

    const canvas = createCanvas(PIXEL_WIDTH, canvasHeight);
    const ctx = canvas.getContext("2d");

    keyboard.keys.forEach((key) => renderKey(key, ctx, unitRatio));

    return canvas;
};

const outFile = glob
    .sync("kle/**/*.json")
    .map((path) => fs.readFileSync(path).toString())
    .map((contents) => Serial.parse(contents))
    .map(renderKeyboard)
    .reduce((o, c) => o + `<img src="${c.toDataURL("image/png")}" />`, "");

fs.writeFileSync(".out.html", outFile);

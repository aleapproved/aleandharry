#!/usr/bin/env python3
"""Cut a character badge out of its original white-background artwork.

The badges are line art on white, so the background is separated by flooding
inwards from the edges rather than by matching colour across the whole image.
Colour matching punches holes wherever the artwork happens to contain a light
or a compression-speckled pixel — that is what left the earlier badges full of
pinholes, most visibly as a halo around Bellibolt's pupils in dark mode.
Flooding stops at the character's outline, so enclosed light areas like the
eyes stay solid.

Usage:
  make-badge.py SRC OUT.png --height 300
  make-badge.py SRC OUT.png --canvas 108 108 --content-scale 0.885

The marks are sized by height in CSS, so a tight crop (the default) makes every
badge render at the same optical size. --canvas with --content-scale keeps a
fixed square canvas with the artwork centred, which is what the round theme
toggle needs.
"""

import argparse
import numpy as np
from PIL import Image
from scipy.ndimage import binary_propagation

WHITE_THRESHOLD = 238  # a pixel this bright on every channel counts as paper


def cutout(path):
    """Return an RGBA image with the paper background made transparent."""
    rgb = np.array(Image.open(path).convert('RGB')).astype(np.int16)
    h, w = rgb.shape[:2]

    paper = (rgb >= WHITE_THRESHOLD).all(axis=2)

    # Seed from the border and let the flood spread only through paper, so
    # white enclosed by the character's outline is never reached.
    seed = np.zeros((h, w), bool)
    seed[0], seed[-1], seed[:, 0], seed[:, -1] = True, True, True, True
    seed &= paper
    background = binary_propagation(seed, mask=paper)

    rgba = np.dstack([rgb, np.where(background, 0, 255)]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    return im.crop(im.getbbox())


def resize_premultiplied(im, size):
    """Resize RGBA without letting the transparent background bleed inwards.

    Averaging raw RGB across the silhouette edge mixes in the background's
    white and leaves a pale fringe. Premultiplying by alpha first weights each
    pixel by its own coverage, so only real colour contributes.
    """
    a = np.array(im).astype(np.float64)
    alpha = a[..., 3:4] / 255.0
    premultiplied = np.dstack([a[..., :3] * alpha, a[..., 3]]).astype(np.uint8)

    small = np.array(
        Image.fromarray(premultiplied, 'RGBA').resize(size, Image.LANCZOS)
    ).astype(np.float64)

    out_alpha = np.clip(small[..., 3:4], 0, 255)
    with np.errstate(divide='ignore', invalid='ignore'):
        rgb = np.where(out_alpha > 0, small[..., :3] / (out_alpha / 255.0), 0)
    return Image.fromarray(
        np.dstack([np.clip(rgb, 0, 255), out_alpha]).astype(np.uint8), 'RGBA'
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument('source')
    p.add_argument('out')
    p.add_argument('--height', type=int, help='content height for a tight crop')
    p.add_argument('--canvas', type=int, nargs=2, metavar=('W', 'H'))
    p.add_argument('--content-scale', type=float, default=1.0)
    args = p.parse_args()

    art = cutout(args.source)

    if args.canvas:
        cw, ch = args.canvas
        limit_w, limit_h = cw * args.content_scale, ch * args.content_scale
    else:
        scale = args.height / art.height
        cw, ch = round(art.width * scale), args.height
        limit_w, limit_h = cw, ch

    scale = min(limit_w / art.width, limit_h / art.height)
    placed = resize_premultiplied(
        art, (max(1, round(art.width * scale)), max(1, round(art.height * scale)))
    )

    canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    canvas.paste(placed, ((cw - placed.width) // 2, (ch - placed.height) // 2))
    canvas.save(args.out, optimize=True)
    print(f'{args.out}: {cw}x{ch}, artwork {placed.width}x{placed.height}')


if __name__ == '__main__':
    main()

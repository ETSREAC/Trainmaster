#!/usr/bin/env python3
"""
3D Print Generator: Stream Deck XL + Brimford Rotary Puck Dual Console
Ergonomic angled desktop console for TrainMaster
"""

import os
import trimesh
import numpy as np
from shapely.geometry import Polygon

def make_box(w, l, h, x=0, y=0, z=0):
    b = trimesh.creation.box((w, l, h))
    b.apply_translation([x, y, z + h/2])
    return b

def make_cylinder(r, h, x=0, y=0, z=0, sections=48):
    c = trimesh.creation.cylinder(radius=r, height=h, sections=sections)
    c.apply_translation([x, y, z + h/2])
    return c

def generate_dock():
    out_dir = os.path.join("hardware", "enclosure", "streamdeck_xl_dock")
    os.makedirs(out_dir, exist_ok=True)

    w_total = 260.0
    l_total = 130.0
    h_front = 14.0
    h_back = 55.0
    slope_angle = np.degrees(np.arctan2(h_back - h_front, l_total)) # ~17.5 degrees

    print(f"-> Generating Stream Deck XL + Rotary Puck Console (Slope: {slope_angle:.1f}°)...")

    # 1. Base Wedge Body
    poly = Polygon([(-l_total/2, 0), (l_total/2, 0), (l_total/2, h_back), (-l_total/2, h_front)])
    wedge = trimesh.creation.extrude_polygon(poly, height=w_total)
    rot_mat = np.array([
        [0, 0, 1, -w_total/2],
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 1]
    ])
    wedge.apply_transform(rot_mat)

    cuts = []

    # 2. Stream Deck XL Pocket (Left side: X = -35 mm)
    # Dimensions: 184 x 114 mm, depth 16 mm into the sloped face
    sd_w, sd_l, sd_h = 184.0, 114.0, 30.0
    sd_bay = make_box(sd_w, sd_l, sd_h, x=0, y=0, z=-sd_h/2)
    # Rotate by slope angle around X
    rot_slope = trimesh.transformations.rotation_matrix(np.radians(-slope_angle), [1, 0, 0])
    sd_bay.apply_transform(rot_slope)
    # Position at top surface of wedge
    # Top surface at Y=0 is Z = (h_front + h_back)/2 = 34.5 mm
    sd_bay.apply_translation([-35.0, 0, 34.5 + 4.0])
    cuts.append(sd_bay)

    # 2b. USB-C Cable Slot for Stream Deck (center-back)
    sd_cable = make_box(32.0, 40.0, 25.0, x=-35.0, y=55.0, z=35.0)
    cuts.append(sd_cable)

    # 3. Brimford Rotary Puck Pocket (Right side: X = +90 mm)
    # Diameter 66 mm, depth 10 mm
    puck_d = 66.0
    puck_h = 25.0
    puck_bay = make_cylinder(r=puck_d/2, h=puck_h, x=0, y=0, z=-puck_h/2)
    puck_bay.apply_transform(rot_slope)
    puck_bay.apply_translation([90.0, 0, 34.5 + 4.0])
    cuts.append(puck_bay)

    # 3b. USB-C Cable Slot for Puck
    puck_cable = make_box(16.0, 45.0, 20.0, x=90.0, y=45.0, z=30.0)
    cuts.append(puck_cable)

    # 4. Hollow bottom cavity to save filament (leaves 4mm solid shell)
    poly_in = Polygon([(-l_total/2 + 6, 0), (l_total/2 - 6, 0), (l_total/2 - 6, h_back - 14), (-l_total/2 + 6, h_front - 6)])
    cavity = trimesh.creation.extrude_polygon(poly_in, height=w_total - 16)
    rot_cav = np.array([
        [0, 0, 1, -(w_total - 16)/2],
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 1]
    ])
    cavity.apply_transform(rot_cav)
    cavity.apply_translation([0, 0, -1.0])
    cuts.append(cavity)

    # Apply cuts
    body = wedge
    for i, c in enumerate(cuts):
        body = body.difference(c, engine='manifold')
        print(f"  Applied cut {i+1}/{len(cuts)}")

    out_file = os.path.join(out_dir, "sd_xl_puck_console.stl")
    body.export(out_file)
    print(f"  [OK] Console saved to {out_file} (Faces: {len(body.faces)}, Watertight: {body.is_watertight})")

if __name__ == "__main__":
    generate_dock()

#!/usr/bin/env python3
"""
TrainMaster ThrottleOne - 3D Enclosure & Keycap STL Generator (v2 Architecture)
Solves all mechanical and mounting issues:
1. Solid EC11 Rotary Encoder Hub:
   - Rigid central boss with 7.2 mm hole for the EC11 threaded collar and M7 nut
   - Annular halo light ring (diameters 34 mm to 42 mm) with 4 diagonal support bridges
   - 50.4 mm rear pocket for the WS2812B 12-LED ring
   - 33.0 mm knob covers the hub and nut completely, leaving a clean illuminated halo
2. Internal Space & Clear Separation (Total Height = 34.0 mm):
   - Upper Zone: ESP32-S3 DevKit mounted flat on standoffs under the 1.54" display (20+ mm vertical clearance)
   - Middle Zone: EC11 encoder & MTS-103 toggle switch with completely open wiring space underneath
   - Lower Zone: 18650 Battery Holder seated longitudinally between side retention rails
   - MX Keyboard Switches positioned at X = ±20 mm, leaving a 26 mm center corridor over the battery
   - Bottom Edge: TP4056 USB-C port cutout and power switch cutout
"""

import os
import sys
import numpy as np
import trimesh
from shapely.geometry import box, Polygon

def make_rounded_box(w, l, h, r, segments=16):
    poly = box(-w/2 + r, -l/2 + r, w/2 - r, l/2 - r).buffer(r, resolution=segments)
    mesh = trimesh.creation.extrude_polygon(poly, height=h)
    return mesh

def make_cylinder(r, h, x=0, y=0, z=0, sections=32):
    c = trimesh.creation.cylinder(radius=r, height=h, sections=sections)
    c.apply_translation([x, y, z + h/2])
    return c

def make_box(w, l, h, x=0, y=0, z=0):
    b = trimesh.creation.box((w, l, h))
    b.apply_translation([x, y, z + h/2])
    return b

def build_top_shell(output_path):
    print("-> Generating Top Shell (throttle_top.stl)...")
    w, l = 72.0, 160.0
    h_top = 16.0
    r = 8.0
    wall = 2.4

    # Outer body
    top_outer = make_rounded_box(w, l, h_top, r)

    # Hollow cavity
    cavity_w, cavity_l = w - 2*wall, l - 2*wall
    cavity_r = max(1.0, r - wall)
    top_cavity = make_rounded_box(cavity_w, cavity_l, h_top - wall, cavity_r)

    # 4 Corner Screw Bosses
    screw_pos = [(-26.0, -68.0), (26.0, -68.0), (-26.0, 68.0), (26.0, 68.0)]
    bosses = [make_cylinder(r=3.8, h=h_top - wall, x=sx, y=sy, z=0) for sx, sy in screw_pos]

    top_body = top_outer.difference(top_cavity, engine='manifold')
    for b in bosses:
        top_body = top_body.union(b, engine='manifold')

    # Central Mounting Hub for EC11 (diameter 26mm)
    encoder_y = 10.0
    hub = make_cylinder(r=13.0, h=h_top - wall, x=0, y=encoder_y, z=0, sections=36)
    top_body = top_body.union(hub, engine='manifold')

    # 4 Bridges connecting hub to outer front face (width 3.0mm at 45, 135, 225, 315 deg)
    bridge_len = 25.0
    for angle in [45, 135, 225, 315]:
        rad = np.radians(angle)
        br = make_box(3.0, bridge_len, wall, x=0, y=0, z=h_top - wall)
        rot = trimesh.transformations.rotation_matrix(rad, [0, 0, 1])
        br.apply_transform(rot)
        br.apply_translation([0, encoder_y, 0])
        top_body = top_body.union(br, engine='manifold')

    cuts = []

    # 1. Display Window at (0, 50.0)
    cuts.append(make_box(28.5, 28.5, wall + 2.0, x=0, y=50.0, z=h_top - wall - 1.0))
    cuts.append(make_box(32.5, 44.0, 1.4, x=0, y=50.0, z=h_top - wall))

    # 2. EC11 7.2mm Mounting Hole through Center Hub
    cuts.append(make_cylinder(r=3.6, h=h_top + 2.0, x=0, y=encoder_y, z=-1.0, sections=32))
    # Underside square recess for EC11 body (13x13 mm, 1.5mm deep from inside)
    cuts.append(make_box(13.0, 13.0, 1.5, x=0, y=encoder_y, z=h_top - wall))

    # 3. Annular Halo Ring Slot: diameters 34.0 mm to 42.0 mm (r=17 to r=21)
    halo_outer = make_cylinder(r=21.0, h=wall + 2.0, x=0, y=encoder_y, z=h_top - wall - 1.0, sections=48)
    halo_inner = make_cylinder(r=17.0, h=wall + 4.0, x=0, y=encoder_y, z=h_top - wall - 2.0, sections=48)
    halo_slot = halo_outer.difference(halo_inner, engine='manifold')
    cuts.append(halo_slot)

    # 4. Underside LED Ring Pocket (50.4 mm diameter, 1.8 mm deep from inside)
    cuts.append(make_cylinder(r=25.2, h=1.8, x=0, y=encoder_y, z=h_top - wall, sections=48))

    # 5. MTS-103 Toggle Switch 6.35 mm Hole at (0, -20.0)
    cuts.append(make_cylinder(r=3.175, h=wall + 2.0, x=0, y=-20.0, z=h_top - wall - 1.0, sections=32))

    # 6. 4x MX Switches (14.1 x 14.1 mm) at x=±20.0, y=-44 and -65
    mx_pos = [(-20.0, -44.0), (20.0, -44.0), (-20.0, -65.0), (20.0, -65.0)]
    for mx, my in mx_pos:
        cuts.append(make_box(14.1, 14.1, wall + 2.0, x=mx, y=my, z=h_top - wall - 1.0))
        cuts.append(make_box(17.0, 17.0, 0.9, x=mx, y=my, z=h_top - wall))

    # 7. Screw Holes (3.4 mm) and Countersinks (6.2 mm x 3.0 mm)
    for sx, sy in screw_pos:
        cuts.append(make_cylinder(r=1.7, h=h_top + 2.0, x=sx, y=sy, z=-1.0, sections=24))
        cuts.append(make_cylinder(r=3.1, h=3.0, x=sx, y=sy, z=h_top - 3.0, sections=24))

    # 8. Interlocking Mating Rebate at rim
    rebate_outer = make_rounded_box(w, l, 1.2, r)
    rebate_inner = make_rounded_box(w - 2.4, l - 2.4, 2.0, max(1.0, r - 1.2))
    cuts.append(rebate_outer.difference(rebate_inner, engine='manifold'))

    for c in cuts:
        top_body = top_body.difference(c, engine='manifold')

    top_body.export(output_path)
    print(f"  [OK] Top Shell saved to {output_path} (Watertight: {top_body.is_watertight})")


def build_bottom_shell(output_path):
    print("-> Generating Bottom Shell (throttle_bottom.stl)...")
    w, l = 72.0, 160.0
    h_bot = 18.0
    r = 8.0
    wall = 2.4

    # Outer body
    bottom_outer = make_rounded_box(w, l, h_bot, r)

    # Hollow cavity
    cavity_w, cavity_l = w - 2*wall, l - 2*wall
    cavity_r = max(1.0, r - wall)
    bottom_cavity = make_rounded_box(cavity_w, cavity_l, h_bot - wall + 1.0, cavity_r)
    bottom_cavity.apply_translation([0, 0, wall])

    # 4 Corner Heat-Set Insert Bosses
    screw_pos = [(-26.0, -68.0), (26.0, -68.0), (-26.0, 68.0), (26.0, 68.0)]
    bosses = [make_cylinder(r=4.0, h=h_bot - wall, x=sx, y=sy, z=wall) for sx, sy in screw_pos]

    # ESP32-S3 Standoffs in Upper Zone (under display)
    esp_standoffs = [
        make_cylinder(r=2.5, h=3.5, x=-12.5, y=36.0, z=wall),
        make_cylinder(r=2.5, h=3.5, x=12.5, y=36.0, z=wall),
        make_cylinder(r=2.5, h=3.5, x=-12.5, y=66.0, z=wall),
        make_cylinder(r=2.5, h=3.5, x=12.5, y=66.0, z=wall),
    ]

    # 18650 Battery Retention Rails in Lower Zone (Y = -72 to -2 mm)
    rail_l = make_box(2.0, 72.0, 6.0, x=-11.8, y=-37.0, z=wall)
    rail_r = make_box(2.0, 72.0, 6.0, x=11.8, y=-37.0, z=wall)
    end_top = make_box(22.0, 2.0, 6.0, x=0, y=-1.0, z=wall)

    # Interlocking Tongue
    tongue_outer = make_rounded_box(w - 2.5, l - 2.5, 1.2, max(1.0, r - 1.25))
    tongue_inner = make_rounded_box(cavity_w, cavity_l, 2.0, cavity_r)
    tongue = tongue_outer.difference(tongue_inner, engine='manifold')
    tongue.apply_translation([0, 0, h_bot])

    bottom_body = bottom_outer.difference(bottom_cavity, engine='manifold')
    for b in bosses:
        bottom_body = bottom_body.union(b, engine='manifold')
    for s in esp_standoffs:
        bottom_body = bottom_body.union(s, engine='manifold')
    bottom_body = bottom_body.union(rail_l, engine='manifold')
    bottom_body = bottom_body.union(rail_r, engine='manifold')
    bottom_body = bottom_body.union(end_top, engine='manifold')
    bottom_body = bottom_body.union(tongue, engine='manifold')

    cuts = []

    # 1. 4x M3 Heat-Set Insert Holes (4.2 mm diameter, 6.0 mm deep)
    for sx, sy in screw_pos:
        cuts.append(make_cylinder(r=2.1, h=6.5, x=sx, y=sy, z=h_bot - 6.0, sections=24))

    # 2. USB-C Port Cutout at bottom edge (Y = -80.0)
    cuts.append(make_box(11.0, 10.0, 6.0, x=0, y=-80.0, z=6.0))

    # 3. Power Switch Cutout on left side (X = -36.0, Y = 10.0)
    cuts.append(make_box(10.0, 9.0, 4.2, x=-36.0, y=10.0, z=7.0))

    # 4. Lanyard Eyelet through bottom corner
    cuts.append(make_cylinder(r=1.8, h=20.0, x=-29.0, y=-73.0, z=0, sections=24))

    for c in cuts:
        bottom_body = bottom_body.difference(c, engine='manifold')

    bottom_body.export(output_path)
    print(f"  [OK] Bottom Shell saved to {output_path} (Watertight: {bottom_body.is_watertight})")


def build_keycap_function(output_path):
    print("-> Generating Function Keycap (keycap_function.stl)...")
    w, h = 16.5, 8.5
    poly = box(-w/2 + 2.0, -w/2 + 2.0, w/2 - 2.0, w/2 - 2.0).buffer(2.0, resolution=16)
    cap = trimesh.creation.extrude_polygon(poly, height=h)

    # Ergonomic cylindrical thumb scoop on top face
    scoop = trimesh.creation.cylinder(radius=25.0, height=25.0, sections=48)
    rot = trimesh.transformations.rotation_matrix(np.pi/2, [1, 0, 0])
    scoop.apply_transform(rot)
    scoop.apply_translation([0, 0, h + 24.2])
    cap = cap.difference(scoop, engine='manifold')

    # Underside Cavity
    cavity = make_box(13.5, 13.5, 5.0, x=0, y=0, z=0)
    cap = cap.difference(cavity, engine='manifold')

    # Stem Post
    stem_post = make_cylinder(r=2.8, h=5.0, x=0, y=0, z=0, sections=32)
    cap = cap.union(stem_post, engine='manifold')

    # MX Stem Cross Cutout (+0.15 mm Snug Fit: 1.35 mm slot width)
    slot1 = make_box(1.35, 4.15, 4.5, x=0, y=0, z=0)
    slot2 = make_box(4.15, 1.35, 4.5, x=0, y=0, z=0)
    cap = cap.difference(slot1, engine='manifold')
    cap = cap.difference(slot2, engine='manifold')

    cap.export(output_path)
    print(f"  [OK] Function Keycap saved to {output_path} (Watertight: {cap.is_watertight})")


def build_keycap_stop(output_path):
    print("-> Generating Emergency Stop Keycap (keycap_stop.stl)...")
    w, h = 16.5, 6.0
    poly = box(-w/2 + 2.0, -w/2 + 2.0, w/2 - 2.0, w/2 - 2.0).buffer(2.0, resolution=16)
    base = trimesh.creation.extrude_polygon(poly, height=h)

    # Dome head (radius 10.5 mm)
    dome = trimesh.creation.cylinder(radius=10.5, height=5.0, sections=48)
    dome.apply_translation([0, 0, h + 2.5])
    cap = base.union(dome, engine='manifold')

    # Bevel
    bevel = trimesh.creation.icosphere(subdivisions=3, radius=16.0)
    bevel.apply_translation([0, 0, -5.0])
    cap = cap.intersection(bevel, engine='manifold')

    # Underside Cavity
    cavity = make_box(13.5, 13.5, 5.0, x=0, y=0, z=0)
    cap = cap.difference(cavity, engine='manifold')

    # Stem Post
    stem_post = make_cylinder(r=2.8, h=5.0, x=0, y=0, z=0, sections=32)
    cap = cap.union(stem_post, engine='manifold')

    # MX Stem Cross Cutout
    slot1 = make_box(1.35, 4.15, 4.5, x=0, y=0, z=0)
    slot2 = make_box(4.15, 1.35, 4.5, x=0, y=0, z=0)
    cap = cap.difference(slot1, engine='manifold')
    cap = cap.difference(slot2, engine='manifold')

    cap.export(output_path)
    print(f"  [OK] Emergency Stop Keycap saved to {output_path} (Watertight: {cap.is_watertight})")


if __name__ == "__main__":
    out_dir = os.path.join("hardware", "enclosure", "stl")
    os.makedirs(out_dir, exist_ok=True)
    
    top_stl = os.path.join(out_dir, "throttle_top.stl")
    bot_stl = os.path.join(out_dir, "throttle_bottom.stl")
    f_cap_stl = os.path.join(out_dir, "keycap_function.stl")
    stop_cap_stl = os.path.join(out_dir, "keycap_stop.stl")

    print("=== TrainMaster ThrottleOne 3D Model Generator (v2 Architecture) ===")
    build_top_shell(top_stl)
    build_bottom_shell(bot_stl)
    build_keycap_function(f_cap_stl)
    build_keycap_stop(stop_cap_stl)
    print("=== All 4 3D models updated and exported successfully! ===")

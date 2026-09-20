// ==============================================================================
// TrainMaster ThrottleOne - Parametrisches Gehäuse (OpenSCAD) - Version 2
// Handregler für TrainMaster & DCC-EX mit ESP32-S3
// ==============================================================================
// Alle Maße in Millimeter (mm)
// ==============================================================================

$fn = 60; // Kreisauflösung

// --- HAUPTABMESSUNGEN ---
gehaeuse_laenge     = 160.0; // Gesamtlänge
gehaeuse_breite     = 72.0;  // Gesamtbreite
h_top               = 16.0;  // Höhe Oberschale
h_bot               = 18.0;  // Höhe Unterschale (Gesamthöhe = 34.0 mm)
wandstaerke         = 2.4;   // 6 Wandlinien
ecken_radius        = 8.0;   // Ergonomische Abrundung

// --- TOLERANZEN ---
tol_snug            = 0.12;  // Übergangspassung (Tastatur-Switches, Keycaps)
tol_sliding         = 0.25;  // Gleitpassung (Fuge)
tol_clearance       = 0.50;  // Spielpassung (Display, USB-C)

// --- DISPLAY (1.54" IPS ST7789) ---
display_fenster_b   = 28.5;
display_fenster_h   = 28.5;
display_pcb_b       = 32.5;
display_pcb_l       = 44.0;
display_pos_y       = 50.0;

// --- DREHREGLER & STATUS-HALO ---
encoder_y           = 10.0;
encoder_bohrung     = 7.20;  // 7.2 mm Loch für EC11 M7 Gewindekragen
halo_innen          = 34.0;  // Lichtspalt Innen
halo_aussen         = 42.0;  // Lichtspalt Außen (rund um 33mm Drehknopf)
led_ring_tasche_d   = 50.4;  // 50.4 mm Tasche für WS2812B 12-Bit Platine

// --- RICHTUNGSSCHALTER (MTS-103) ---
toggle_bohrung      = 6.35;
toggle_pos_y        = -20.0;

// --- MECHANISCHE SWITCHES (Cherry MX) ---
mx_ausschnitt       = 14.10;
mx_abstand_x        = 20.0;  // ±20mm = 40mm Raster (lässt 26mm Mitte frei für Akku!)
mx_reihe1_y         = -44.0; // Reihe 1: Nothalt (links) + F0 Licht (rechts)
mx_reihe2_y         = -65.0; // Reihe 2: F1 Sound (links) + F2 Horn (rechts)

// --- SCHRAUBDOME & EINSCHMELZGEWINDE (M3) ---
schraube_x          = 26.0;
schraube_y          = 68.0;
insert_bohrung      = 4.20;
insert_aussen       = 8.00;
schraube_durchgang  = 3.40;
senk_kopf_d         = 6.20;
senk_kopf_tiefe     = 3.00;

// ==============================================================================
// MODULE
// ==============================================================================

module rounded_rect(w, l, h, r) {
    linear_extrude(height = h) {
        hull() {
            translate([-w/2 + r, -l/2 + r]) circle(r = r);
            translate([ w/2 - r, -l/2 + r]) circle(r = r);
            translate([-w/2 + r,  l/2 - r]) circle(r = r);
            translate([ w/2 - r,  l/2 - r]) circle(r = r);
        }
    }
}

module top_shell() {
    difference() {
        // Außenkörper
        rounded_rect(gehaeuse_breite, gehaeuse_laenge, h_top, ecken_radius);
        
        // Innenhöhlung
        translate([0, 0, -0.1])
            rounded_rect(gehaeuse_breite - 2*wandstaerke, gehaeuse_laenge - 2*wandstaerke, h_top - wandstaerke + 0.1, max(1, ecken_radius - wandstaerke));

        // 1. Display
        translate([0, display_pos_y, h_top - wandstaerke - 0.5])
            cube([display_fenster_b, display_fenster_h, wandstaerke + 1], center = true);
        translate([0, display_pos_y, h_top - wandstaerke])
            cube([display_pcb_b, display_pcb_l, 1.4], center = true);

        // 2. EC11 7.2mm Bohrung
        translate([0, encoder_y, -0.5])
            cylinder(d = encoder_bohrung, h = h_top + 1);

        // 2b. EC11 Passungstasche innen
        translate([0, encoder_y, h_top - wandstaerke])
            cube([13.0, 13.0, 1.5], center = true);

        // 2c. Halo-Lichtschlitz (durch Stege gestützt)
        difference() {
            translate([0, encoder_y, h_top - wandstaerke - 0.5])
                cylinder(d = halo_aussen, h = wandstaerke + 1);
            translate([0, encoder_y, h_top - wandstaerke - 1.0])
                cylinder(d = halo_innen, h = wandstaerke + 2);
            // 4 Stege (Brücken)
            for (rot_angle = [45, 135]) {
                rotate([0, 0, rot_angle])
                    translate([0, encoder_y, h_top - wandstaerke - 0.5])
                        cube([3.0, 50.0, wandstaerke + 1], center = true);
            }
        }

        // 2d. LED-Ring Tasche
        translate([0, encoder_y, h_top - wandstaerke])
            cylinder(d = led_ring_tasche_d, h = 1.8);

        // 3. MTS-103 Kippschalter
        translate([0, toggle_pos_y, -0.5])
            cylinder(d = toggle_bohrung, h = h_top + 1);

        // 4. MX Switches (4x)
        for (pos = [[-mx_abstand_x, mx_reihe1_y], [mx_abstand_x, mx_reihe1_y],
                    [-mx_abstand_x, mx_reihe2_y], [mx_abstand_x, mx_reihe2_y]]) {
            translate([pos[0], pos[1], h_top - wandstaerke - 0.5])
                cube([mx_ausschnitt, mx_ausschnitt, wandstaerke + 1], center = true);
            translate([pos[0], pos[1], h_top - wandstaerke])
                cube([17.0, 17.0, 0.9], center = true);
        }

        // 5. Schraublöcher (4x M3)
        for (sx = [-schraube_x, schraube_x]) {
            for (sy = [-schraube_y, schraube_y]) {
                translate([sx, sy, -0.5])
                    cylinder(d = schraube_durchgang, h = h_top + 1);
                translate([sx, sy, h_top - senk_kopf_tiefe])
                    cylinder(d = senk_kopf_d, h = senk_kopf_tiefe + 0.1);
            }
        }

        // 6. Mating Fuge
        difference() {
            rounded_rect(gehaeuse_breite, gehaeuse_laenge, 1.2, ecken_radius);
            translate([0, 0, -0.5])
                rounded_rect(gehaeuse_breite - 2.4, gehaeuse_laenge - 2.4, 2.5, max(1, ecken_radius - 1.2));
        }
    }
}

module bottom_shell() {
    difference() {
        rounded_rect(gehaeuse_breite, gehaeuse_laenge, h_bot, ecken_radius);

        translate([0, 0, wandstaerke])
            rounded_rect(gehaeuse_breite - 2*wandstaerke, gehaeuse_laenge - 2*wandstaerke, h_bot, max(1, ecken_radius - wandstaerke));

        // 1. M3 Gewindebohrungen
        for (sx = [-schraube_x, schraube_x]) {
            for (sy = [-schraube_y, schraube_y]) {
                translate([sx, sy, h_bot - 6.0])
                    cylinder(d = insert_bohrung, h = 6.5);
            }
        }

        // 2. USB-C Ladeport
        translate([0, -gehaeuse_laenge/2, 6.0])
            cube([11.0, 10.0, 6.0], center = true);

        // 3. Ein/Aus-Schalter seitlich
        translate([-gehaeuse_breite/2, 10.0, 7.0])
            cube([10.0, 9.0, 4.2], center = true);

        // 4. Lanyard
        translate([-29.0, -73.0, -0.5])
            cylinder(d = 3.6, h = h_bot + 1);
    }
}

// Ansicht in OpenSCAD:
translate([-gehaeuse_breite/2 - 5, 0, 0]) top_shell();
translate([ gehaeuse_breite/2 + 5, 0, 0]) bottom_shell();

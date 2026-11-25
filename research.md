# SlotForge Chassis — research notes

Collected 24 November 2026, before any design or code. Three sources: web research, a survey of the other SlotForge apps, and measurements of seven example STL parts.

Confidence marks used below:

- **[D]** from a manufacturer drawing, catalogue or rulebook that was read directly.
- **[P]** measured from the example STL parts.
- **[F]** reported on a forum or in a shop listing; one source, not checked.
- **[?]** unknown or conflicting; needs a caliper on real parts.

Many forums and model sites blocked direct reading, so [F] values are weaker than they look.

A second pass through maker catalogues is in [parts-data.md](parts-data.md). Where the two files differ, parts-data.md is newer. Its main corrections to this file:

- Bushing and bearing seat: Ø4.75 for 1/32, Ø6 for 1/24 (Sloting Plus, published).
- Sidewinder distance: still unmeasured, but the mesh can be checked by gear diameter sum (24.5 for Slot.it).
- Slot.it offset 1.25 gives an axle height of 8.75.
- 1/24 now has real defaults: 3 mm axle, 3 × 6 bearings, 1.5 mm plate, 4.8 mm guide post.

## 1. How a podded slot car is laid out

- The **chassis** carries the guide, the front axle, the body mounts and the lead wires.
- The **motor pod** carries the motor, both rear axle bushings (so the rear axle and gear) and usually a magnet pocket.
- The pod is screwed to the chassis at 3 to 6 points and is normally left slightly loose ("float") to tune handling. Front screws tight then backed off one turn; rear screws looser. [D]
- Body screws are also run slightly loose for the same reason. [D]

## 2. Motors [D]

From Mabuchi and Kinmore outline drawings. All in mm.

| Motor (slot name) | Can length | Across round | Across flats | Front boss | Shaft | Mount holes |
|---|---|---|---|---|---|---|
| FC-130 (S-can, short can) | 25.0 | 20.1 | 15.1 | Ø6.15 × 1.7 | Ø2.0 | none on drawing; slot versions have 2 × M2 |
| FK-130 | 25.1 | 20.4 | 15.4 | Ø6.15 × 1.6 | Ø2.0 | 2 holes, 12.4 pitch |
| FK-180 (long can) | 32.1 | 20.4 | 15.4 | Ø6.15 × 1.6 | Ø2.0 | 2 × M2, 12.4 pitch, max 2.0 deep |
| FF-050 (slimline) | 26.9 | 15.5 | 12.0 | Ø4.7 × 1.4 | Ø1.5 | 2 × M2, 10.0 pitch on a 30° diagonal |
| FF-030 (short slim) | 18.6 | 15.5 | 12.0 | Ø4.7 × 1.5 | Ø1.5 | 2 × M2, 10.0 pitch at 30° |

The 12.4 mm screw pitch was confirmed on the example anglewinder pod. [P]

## 3. Orientation and gearing

| Layout | Motor to axle | Gear | Typical gear / pinion |
|---|---|---|---|
| Inline | 90° | crown | 23–30 T crown, 8–11 T pinion (Ø5.5) [D] |
| Sidewinder | parallel | spur | Ø18 spur 31–36 T with Ø6.5 pinion; Ø19 spur with Ø6.0 pinion [D] |
| Anglewinder | angled | angled crown | Ø16–18 crown 26–36 T, Ø6.5 pinion [D] |

- **Offset** is how far the rear axle sits above the motor shaft. Slot.it: 0 / 0.5 / 0.75 / 1.0 mm gives a rear axle centre 7.5 / 8.0 / 8.25 / 8.5 mm above the chassis underside. [D]
- The example inline pod has axle and motor shaft both at 7.5 mm (zero offset). [P]
- **Anglewinder angle belongs to the gear family**, not the designer: about 25° Slot.it, 15° NSR, 20° Ninco. [F] The example pod measures 24.8°. [P]
- **Sidewinder centre distance is unresolved [?]**: 11.25 mm by gear theory, about 12.25 mm on a forum, about 13.3 mm (±0.3) on the example pod. It must be an editable, per-gear-set value.
- Slot gears are nominally module 0.5, but makers squeeze different tooth counts onto the same diameter so the centre distance stays fixed. [F]

## 4. Axles, bushings, bearings

- 1/32 axle: 3/32" = 2.38 mm. Also 2.5 mm (Ninco) and 2 mm. 1/24: 3 mm or 1/8". [D]
- Slot.it bronze bushing: body about 4.92, flange about 5.97, flange about 0.67 thick. [F]
- Ball bearing: 2.38 × 4.76 × 2.38, flange 5.94. [F]
- Example pods use snap-in cups wrapping about 250°, seat diameter 4.9 to 5.7 depending on the cut. [P, rough]
- Spherical bushings self-align and forgive printed misalignment. [F]

## 5. Guide

| Brand | Post Ø |
|---|---|
| NSR | 3.4–3.45 [F] |
| Slot.it | 3.55–3.6 [F] |
| Scaleauto | 3.75 [F] |
| Scalextric | 3.75 [F] |
| Carrera 1/32 | 3.85–3.92 [F] |

- Example chassis: 3.8 mm through-hole in a Ø6.3 boss 5.8 tall, inside a Ø19 swing recess. [P]
- Guide lead (rear axle to guide pivot) limit under BSCRA: 105–110 mm for 1/32. [D]

## 6. Front axle

- Solid 3/32" axle in open vertical slots, M2 grub screws below (ride height) and above (travel limit). [D]
- Example chassis: uprights about 34.5 mm apart, Ø2.0 vertical holes from below and above. [P]

## 7. Pod interface

- **Measured on all seven example parts: four screws on a rectangle of about 63.2 × 20.0 mm.** [P] The MG6 chassis is published as Slot.it-pod compatible, so this is probably the Slot.it pattern, but that link is not proven.
- Pod screw holes: Ø1.8 (inline, sidewinder) and Ø2.2 (anglewinder) in the pod; Ø2.5 in the chassis. [P]
- Pod body: 57 × 25.4 mm (inline); sidewinder 28.9 wide; anglewinder 40.6 wide. [P]
- Chassis cut-out: about 68 × 31 mm, with break-out slots for the wider anglewinder pod. [P]
- Pod screws: Slot.it 2.2 × 5.3 mm; NSR 2.2 × 6.5 mm. [D]
- No maker publishes pod drawings. [?]

## 8. Body mounting

- Body screws about 2.2 × 8 mm. Post outer diameter decides the screw: M2.3 for 3.95–4.15, M2.6 for 4.15–4.30. [F]
- Example chassis: four posts, about Ø6.7, Ø2.5 screw hole, Ø4.5 recess underneath for the screw head. [P]
- Anvil's posts today: screw type Ø4.0 outer / Ø1.6 hole; socket type Ø4.6 outer / Ø3.1 hole.

## 9. Overall sizes and rules

| Item | 1/32 | 1/24 |
|---|---|---|
| Wheelbase range | 64–90 (Slot.it HRS2) [D] | about 100–117 [F] |
| Max width | 64 (68 for F1) [D] | 82–83 [D] |
| Axle lengths | 45 / 48 / 51 / 54 [D] | — |
| Fitted rear tyre Ø | about 18.3–21.3 [D] | min 26 in one class [D] |

- Ground clearance rules vary by club: 0.25, 0.5, 0.75, 1.0 or 1.5 mm. [D/F]
- Some rule sets allow printed chassis only if commercially available, and ban homemade ones. [D]

## 10. Printing practice

- **PETG** is the usual home choice (survives motor heat and snap fits). PLA+ works if parts are glued, not snapped. SLS/MJF nylon is the commercial standard but flexes and can arrive warped. Resin is advised against. [F]
- Plate 1.2–2.0 mm with 3 mm ribs. [F]
- Small holes print 0.2–0.3 mm undersize on one reported printer; model small and ream. [F]
- Known failures: uprights snapping (PLA), snap-in clips breaking, pod flex losing gear mesh, stripped screw holes, printed guide posts cracking, wrong wheelbase, warping. [F]
- Fixes people use: cross brace under the bushings, thicker buttressed uprights, glue-in closed cups, washers under screw heads, commercial guides. [F]

## 11. What already exists

- No dedicated chassis generator was found: only hand-edited STLs, mechanical slider chassis and vendors who adjust files per order. (Search only; small scripts may exist.)
- Vendors sell body-specific chassis in a Slot.it-pod version and an NSR-pod version; the two are not interchangeable. [F]

## 12. The SlotForge apps

- **Anvil** (source in `..\Bodyshop`): Electron + Vite single-file page, vanilla JS, three.js, sql.js. Mesh only, **no boolean operations**. Has the `.anvilchassis` share file and chassis-relative post spots (`along` from the front axle, `side` from the centre line).
- **Foundry** (`..\Foundry`): has manifold-3d booleans, a sketcher, extrude/revolve/hole features and an editable history. This is the geometry donor.
- **Telemetry** has gearing and chassis-balance formulas; **Paddock** has build slots for pod, motor, gears and so on.
- Shared look: `..\Timing\SlotForgeRestyle.md` and the theme key `slotforge.appearance.v1`.
- Anvil's car frame: Z up, car stands on Z = 0, centre line Y = 0, X runs from the front (low) to the back (high), millimetres.

## 13. Still to measure on real parts

1. Sidewinder centre distance per gear set.
2. Inline crown diameter and motor-face-to-axle distance.
3. Bushing and bearing seat sizes.
4. Guide post diameters per brand.
5. Whether the 63.2 × 20 pattern really is Slot.it's, and the NSR pattern.
6. Pod-to-chassis gap that gives good float.


## How makers carry the chassis past the pod and the gear (looked up 24 November 2026)

Looked at with my own eyes, from product photos and renders; nothing here is measured. Sources are listed below.

**What every chassis has in common**

- The chassis is a closed ring round the pod: a front section, two side rails and a rear plate behind the rear axle. No chassis looked at is open on one side.
- At the rear axle the side rails are narrow and step in towards the centre line. They pass between the rear wheels, inside the gear, and join the rear plate.
- The gear sits outside the pod's bearing holder, between the holder and the wheel (sidewinder and anglewinder). The user's own photos of Slot.it and Scaleauto cars show the same.

**Two ways the gear is cleared**

1. *Closed slot (Slot.it HRS universal chassis, sidewinder, seen from underneath).* The spur gear runs in a narrow slot in the chassis plate, closed on all four sides: there is plate between the pod opening and the slot, and a thin strip between the slot and the chassis edge. The tyre runs just outside that edge. The slot is only about as wide as the gear's toothed disc.
2. *Rails inside the gear (NSR Audi R18 and ASV GT3 chassis, Slot.it Audi R8C anglewinder chassis, and the 3D-printed chassis from SlotCar-3D for Slot.it and NSR anglewinder pods).* The side rails run inboard of the gear, and the gear and wheel hang free outside them. In these the pod's rear part, with its bearing holders, sits on top of the chassis: the pod opening is narrower at the rear than the pod is across its holders.

**Gears**

- A sidewinder spur gear is a thin toothed disc (with lightening holes) and a central boss with the grub screw on one side (Sloting Plus and Slot.it gear photos). Only the disc reaches down to the chassis; the boss is at axle height.
- On the cars in the user's photos the boss points in towards the bearing and the disc is by the wheel.

**What this means for the app**

- Gear outside the holder: correct as modelled.
- Chassis closed round the pod, gear and tyre free, rail between pod and gear: this is way 2, and what the engine builds now.
- Not yet modelled: the pod's rear sitting on top of the chassis rails. In the app the pod drops into its opening and its floor is level with the plate, which leaves only about 1 mm for the rail between pod and gear; the makers' rails are wider because they pass under the bearing holders.

**Sources**

- Slot.it HRS sidewinder chassis, underside: https://race.cincyslots.com/wp-content/uploads/2017/02/IMG_7005-scaled.jpg
- Slot.it HRS-2 sidewinder chassis CH31F: https://www.slotfun.de/images/product_images/popup_images/SICH31F_100025.jpg
- Slot.it Audi R8C anglewinder chassis CS12t-60: https://cdn11.bigcommerce.com/s-kipy1i4/images/stencil/1280x1280/products/1935/6036/sics12t-60__04993.1562059769.jpg?c=2
- NSR 1412 Audi R18 chassis for inline: https://www.slotcarsupply.com/cdn/shop/files/1412-1.jpg?v=1683315572&width=1445
- NSR 1459 ASV GT3 chassis for anglewinder / inline: https://www.slotcarsupply.com/cdn/shop/files/1459-1.jpg?v=1683319327
- NSR Ford Mk IV with sidewinder, from above: https://www.homeracingworld.com/nsrfordtopchassis1.jpg
- SlotCar-3D printed chassis for the Slot.it anglewinder pod: https://slotcar-3d.de/wp-content/uploads/2023/09/Si_AW-06.jpg and https://slotcar-3d.de/wp-content/uploads/2022/02/0125_FGT_Si-AW.jpg
- SlotCar-3D printed chassis for the NSR anglewinder pod: https://slotcar-3d.de/wp-content/uploads/2024/04/NSR_AW_08.jpg and https://slotcar-3d.de/wp-content/uploads/2024/04/0273-790x395.jpg
- Sloting Plus sidewinder spur gear: https://www.slotcarsupply.com/cdn/shop/files/SP074432b.jpg?v=1684258874&width=1445
- Scaleauto crown gear on a brass chassis: https://www.homeracingworld.us/TeamHRW/wp-content/uploads/2016/11/gear.jpg

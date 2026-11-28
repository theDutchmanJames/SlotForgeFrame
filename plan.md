# SlotForge Frame — plan

Working name. Status: **agreed 24 November 2026; building**. The design reference is `docs/ui-reference/workspace.html`.

Built so far (version 0.7.2): the app shell, the Manifold geometry engine, the chassis and pod model with every feature editable, top view with draggable handles, 3D view, checks, save/open, undo and STL export. See section 9 for what each milestone still needs.

Background facts and measurements are in [research.md](research.md).

## 1. What the app is

A desktop app in the SlotForge App Collection for designing 3D-printable slot car chassis and motor pods.

- The **chassis** holds the front wheels, the guide and the motor pod.
- The **motor pod** holds the motor and the rear axle.
- Every feature's shape and position is the user's to set. Presets are starting values only.
- It works together with Anvil so body mounting posts line up on both sides.

### Who it is for

Someone who can use Anvil, owns a printer and wants a chassis that fits a particular body, without learning CAD.

### Not in the first version

- STEP export (the geometry engine is mesh-based).
- Printed gears, wheels or guides.
- Stiffness simulation. Flex is tuned with features and rules of thumb.
- Changing the wheelbase of an imported STL chassis with a slider (see 5.2).

## 2. Foundation

| Part | Source | Note |
|---|---|---|
| App shell, updater, theming, fonts, build | Anvil | near copy |
| Project file, undo, units, autosave | Anvil | rename the format |
| 3D viewport, section view, picking | Anvil | adapt |
| Step list with replay and cache | Anvil | adapt |
| Library (SQLite file on disk) | Paddock | new tables; Anvil's schema pattern |
| Booleans (manifold-3d) | Foundry | Anvil has none |
| Sketcher, extrude, revolve, hole, mirror | Foundry | take what the features need |
| STL read/write, repair checks | Anvil | near copy |

Stack: Electron, Vite single-file page, vanilla JS, three.js, manifold-3d. Geometry runs in a worker. The library is a SQLite file on disk, opened in the main process (`node:sqlite`, as in Paddock), not Anvil's in-page storage.

**Coordinate frame:** Anvil's car frame, so files exchange without conversion. Millimetres, Z up, track at Z = 0, centre line at Y = 0, X from front to back. Positions along the car are measured from the front axle.

## 3. The model

A project holds one **chassis**, one **pod** and a set of **components**.

### 3.1 Features

Each part is a list of features, replayed in order. Each feature has a type, a position, its own dimensions and an on/off switch. All are editable at any time.

**Chassis features**

| Feature | What the user sets |
|---|---|
| Outline | drawn shape (sketch), plate thickness, mirror on/off |
| Pod opening | from the pod: outline + gap, or drawn by hand |
| Pod mounts | pattern (default 63.2 × 20), hole size, seat height, count 3–6 |
| Guide holder | position, hole Ø, boss Ø and height, swing recess Ø |
| Front axle bracket | position, spread, axle Ø, slot height, grub screw holes |
| Body mount | position, type (post, side tab, socket), height, hole, head recess |
| Rib / rail | path, height, width |
| Flex slot | path, width |
| Pocket | magnet, ballast, digital chip; shape and depth |
| Wire channel | path, width |
| Cut-out, added block | free shape, for anything else |

**Pod features**

| Feature | What the user sets |
|---|---|
| Base plate | outline, thickness |
| Motor seat | motor, orientation, angle, bulkheads, screw holes |
| Rear axle uprights | axle Ø, bushing type, cup type, height (offset), spread, cross brace |
| Mount lugs | pattern, hole size, lug height |
| Gear clearance | from the chosen gear |
| Pocket, cut-out, added block | as on the chassis |

### 3.2 Drivetrain

The user picks motor, orientation (inline, sidewinder, anglewinder), gear pair and offset. The app then places the motor shaft and rear axle.

- Inline: motor at 90°, crown gear.
- Sidewinder: motor parallel, centre distance from the gear set.
- Anglewinder: angle taken from the gear family (it is not a free value).
- Every derived value can be overridden by hand, because several are not reliably published.

### 3.3 Bearing holders

This is the part that must be right.

- Two cup types: **closed** (ream to fit, glue or press) as the default, and **snap-in** (about 250° wrap) for PETG and nylon.
- Both rear cups are cut by one single tool so they are always in line.
- Uprights are buttressed and joined by a cross brace under the axle.
- Seat size comes from the chosen bushing or bearing plus the printer's hole compensation.
- Optional lube hole under each cup.

### 3.4 Shaping the chassis

A chassis is more than a flat plate. Commercial chassis have a raised rear, strakes, flared edges and lightening patterns, and the example chassis show the same (rear diffuser fins on the McLaren, flared side sections on the M3). These tools shape it.

**Symmetry**

- Mirror about the centre line is **on by default** for the whole chassis: draw or place on one side, the other side follows.
- Any single feature can be released from the mirror. This is needed for sidewinder and anglewinder pod openings, wire channels and chip pockets.
- Mirror also works inside a feature (a row of ribs mirrored about its own middle).
- Repeat: copy a feature along a line a set number of times (a row of strakes).

**Outline**

- Drawn in top view with lines, arcs and smooth curves; corners can be rounded.
- Points can be typed in as numbers or dragged.
- Can start from a template, from a traced import, or from the body's underside outline (from Anvil), pulled in by a chosen gap.

**Height shaping**

| Tool | What it does | Typical use |
|---|---|---|
| Kick-up | Tilts the plate upward behind (or ahead of) a fold line, by an angle or to an end height; sharp or curved transition | Raised rear, diffuser, front splitter |
| Side profile | The plate follows a height line drawn in side view | Stepped or gently curved floors |
| Level | Raises or lowers a drawn area to its own height | Pod seat, raised pads, sunken pockets |
| Edge wall | Raises a wall along chosen outline edges, with height, thickness and outward lean | Flared sides, lips, guide rim |
| Rib / strake | A fin along a drawn path with its own height line (constant or tapering); can sit on top or underneath, and follows a kick-up | Stiffening ribs, diffuser strakes |
| Round / bevel | Softens chosen edges and rib bases | Strength at rib roots, looks |
| Tunnel | A hollow channel along a path, with its own cross-section, wall thickness and rise | Box-shaped diffuser ducts |
| Upright panel | A shape drawn on a vertical or tilted plane and given a thickness; can have windows | Rear frame, end plates, fences |

Details the reference photos showed are needed:

- **Kick-up per zone.** A kick-up can cover the full width or only a drawn zone, and several can be combined (centre raised, sides flat).
- **Strakes fill to floor level.** Under a raised plate a strake is a triangle: its top follows the plate, its bottom stays at the chassis underside. Strakes can be placed in groups with their own spacing.
- **End plates.** A strake or panel at the outer edge can rise above the plate as well as below it.
- **Features follow the surface.** A body mount, hole or pocket placed on a raised or tilted area sits on that surface, not on the base plate.
- **Split part.** A complex rear can be cut off as its own print part, with pins or a dovetail to join it, so each piece prints in its best orientation.

**Fill style**

| Style | What it is |
|---|---|
| Closed | A completely filled plate. Stiffest, simplest to print. |
| Open | A filled plate with windows the user draws. |
| Frame | The plate becomes a frame of rails: an outer rail, a spine around the pod, and cross and length rails between them. This is the NSR "wire" style. |
| Lattice | The plate becomes a regular pattern (honeycomb, diamond, triangle) inside a solid border. |

**Frame** follows the NSR reference: thin rails forming open rectangular cells, a rail around the outline, curved bumper rails at the front, and solid pads where things mount.

- The app proposes a frame from the outline: outer rail, pod surround, and a chosen number of cross rails and length rails.
- Every rail can then be moved, added or deleted, and new rails can be drawn freehand, straight or curved.
- Rail width and rail height are set per frame and can be overridden per rail (taller rails are stiffer).

Rules both Frame and Lattice follow:

- Every feature keeps a solid pad around it (screw holes, guide holder, axle brackets, body mounts, pod mounts), linked to the frame.
- Rail and strut width snap to a whole number of nozzle widths from the printer profile.
- The fill can differ per zone (denser at the front, more open in the middle), which is also a way to tune flex.

**Printing consequences**

- A kick-up lifts part of the plate off the print bed, so it needs support. The app warns, and offers strakes underneath that reach bed level and act as built-in supports.
- Tunnel roofs and the plate between strakes are bridges; the app checks each span against the printer profile.
- Edge walls leaning outward past a set angle get the same warning.

### 3.5 Components

Reference parts, not printed: motors, gear sets, axles, bushings and bearings, wheels and tyres, guides, screws. Each has its dimensions and a simple preview shape.

## 4. Live preview and checks

**Preview** (one toggle, plus per-item toggles): axles, wheels and tyres, motor, pinion and gear, guide, track surface, and the body as a ghost.

**Checks**, shown like Anvil's Final check:

- Gear mesh: centre distance against the gear set.
- Ground clearance under chassis, pod, motor and gear, against a chosen limit.
- Collisions: gear against plate, tyres against chassis, motor against body.
- Pod float: does anything touch when the pod tilts.
- Overall width, guide lead and tyre size against a chosen rule set.
- Printability: wall too thin, hole too close to an edge, overhangs needing support.

**Ride-height chain:** tyre Ø, axle height, plate thickness and clearance are solved together; change one and the others update or warn.

## 5. Import

### 5.1 Motor pod (STL)

1. Orient: the app guesses, the user confirms.
2. Detect: screw holes, axle line, motor line and angle are proposed; the user confirms or corrects. This worked on all four example pods.
3. The pod's outline plus a gap becomes the chassis **pod opening**; its screw holes become the **pod mounts**.

### 5.2 Chassis (STL)

1. Orient and detect as above (guide hole, front axle, body posts, pod mounts).
2. The imported shape becomes a fixed base. Features can be added to it and cut from it.
3. It cannot be reshaped by its own dimensions. To get a fully editable chassis, the user can **trace** it: the app proposes an outline and features from what it detected, and builds a native chassis on top.

### 5.3 Body (from Anvil)

The body STL or `.anvil` project loads as a ghost for fit and clearance.

## 6. Working with Anvil

One rule: **the chassis owns the post positions.**

- Frame exports an `.anvilchassis` file: wheelbase, tyres, clearance, deck height, post spots and the real chassis shape.
- Anvil loads it, shows the real chassis and builds the posts on the body at those spots.
- The other way: Frame loads Anvil's body to place mounts where the body has room.

Needs a small Anvil update:

- A version 2 of the share file with post type per spot, post top height and a motor/pod clearance box.
- Anvil should trust the record's axle positions when a chassis STL comes with one.

Later: send drivetrain data to Telemetry and a build list to Paddock.

## 7. Library

One SQLite file in the user's data folder, easy to back up and readable by other SlotForge apps later. Tables:

- **Chassis** and **pods**: made or imported, with shape, features and thumbnail.
- **Pod interfaces**: named patterns (default 63.2 × 20 four-screw).
- **Motors, gear sets, bushings/bearings, axles, wheels, tyres, guides, screws.**
- **Printers**: material, hole compensation, minimum wall.
- **Rule sets**: width, clearance, guide lead limits.

Every row is editable and marks whether its numbers are *measured* or *nominal*. The library ships with the confirmed values from the research and can be exported and imported as one file.

## 8. Export

- STL and 3MF per part, laid flat for printing.
- `.anvilchassis` for Anvil.
- Project file (own format, like `.anvil`).
- **Calibration coupon**: a small test piece with the holes and seats this design uses, to set hole compensation once per printer.
- A parts list of the components used.

## 9. Milestones

| # | Milestone | Result |
|---|---|---|
| M0 | Design preview | Static preview pages of the workspace, agreed before code |
| M1 | Shell | App opens, viewport, project save/load, undo, library file |
| M2 | Geometry core | Boolean engine in the worker; outline sketch to plate; holes; mirror |
| M3 | Chassis features | Guide holder, front axle bracket, body mounts, pockets; symmetry and repeat |
| M3b | Shaping | Kick-up, side profile, levels, edge walls, ribs and strakes, tunnels, upright panels, split part; closed, open, frame and lattice fill |
| M4 | Pod | Drivetrain, motor seat, bearing uprights, lugs; pod opening in chassis |
| M5 | Preview and checks | Component shapes, mesh, clearance, collision, ride height |
| M6 | Import | Pod and chassis STL: orient, detect, opening from outline, trace |
| M7 | Library and printers | Full tables, measured/nominal marks, calibration coupon |
| M8 | Anvil link | `.anvilchassis` v2 both ways; body ghost; Anvil update |
| M9 | Release | Rule sets, 3MF, guide, website entry |

Each milestone ends with tests on real shapes, including the seven example parts.

**How it is tested**

| Command | What it covers |
|---|---|
| `npm test` | 127 tests of the model, the geometry engine, files, the library, the Anvil link, tracing a body and the update check (Node, no browser) |
| `npm run test:ui` | 28 checks of the built app in a real browser (Edge or Chrome, headless, offline): editing, dragging, undo, export, library, import, the Anvil link, themes. Run `npm run build` first |
| `npm run test:desktop` | Opens the desktop app and checks that it starts, builds and opens its library file |

**Where the build stands (0.7.2)**

| Milestone | State |
|---|---|
| M0 Design preview | Done |
| M1 Shell | Done, with the library file and the update check (Settings › Updates) |
| M2 Geometry core | Done: outline to plate, holes, mirror. The outline is edited as points; the full sketcher (arcs, curves) is not built |
| M3 Chassis features | Done: guide holder, front axle bracket, body mounts, pod mounts, pod opening. Pockets, wire channels and free cut-outs are not built |
| M3b Shaping | Done: kick-up (rear and front; full width, centre only or sides only) with strakes, side profile, ribs and strakes, edge walls, tunnels, upright panels, levels and pockets, windows, free rails, plate edge bevel, split part with dovetail keys; closed, frame and lattice fill. Not built: rounding of rib roots and other 3D edges |
| M4 Pod | Done for all three layouts: drivetrain, motor seat, axle uprights (closed, snap-in, clamp), lugs. The anglewinder motor is placed from the measured 25° example pod; its angle to the rear axle can be set by hand, and shallower angles move the pinion further out on the shaft so the can clears the bearing holders. Placement at angles other than 25° is worked out, not measured |
| M5 Preview and checks | Partly: parts preview in both views; checks for clearance, width, guide lead, tyre contact, pod fit, loose pieces. Not built: pod-tilt collision, body clearance, printability checks |
| M6 Import | Done for pods and chassis: STL read, stand-up and turn, screw holes found, pod opening from the pod's shape, imported chassis as a fixed base. Not built: axle and motor line detection, tracing an import into an editable chassis |
| M7 Library and printers | Mostly done: the library file (SQLite on disk); chassis and pods; components (motors, gear sets, bearings, guides) and setup (printers, rule sets, car presets) with built-in entries and your own, each marked confirmed or unconfirmed; share files (.framelib) in and out. A design carries a copy of the own components it uses. The calibration coupon (Print menu) tests every hole size of the design and sets two fixes: one for upright holes, one for sideways holes. Not built: wheels, tyres, axles and screws as components |
| M8 Anvil link | Done on this side: Export for Anvil (.anvilchassis, Anvil's version 1 format, with the chassis and pod model and the body-mount spots), and the body STL from Anvil as a ghost with a fit check. Not built: reading an .anvil project directly, a collision check between body and chassis in 3D. Anvil itself is unchanged. Also built: **Outline › From body**, which traces the body's underside (sides and bumpers, at a gap) into the outline and draws it in at the wheels |
| M9 Release | Prepared, not published: licence, third-party notices, README with pictures, developer notes, app icons, the update check, packaging for Windows (installer, portable, zip; built and start-up tested here) and the workflow for macOS and Linux. Still open: the GitHub repository (the app looks for releases at the `homepage` in package.json, which does not exist yet), the first commit and release, the website entry. Not built: 3MF export |

## 10. Risks

| Risk | Answer |
|---|---|
| Key dimensions are unpublished | Editable library, measured/nominal marks, your caliper readings |
| Printed bearing holders fail | Closed cups by default, cross brace, coupon, material rules |
| Sketching is the hardest tool to make easy | Start from templates and traced outlines; reuse Foundry's sketcher |
| Imported STLs are messy | Repair checks from Anvil; clear refusal when a part is not watertight |
| Scope: two scales at once | One model, two profiles; 1/24 defaults marked unconfirmed until measured |

## 11. Decisions (24 November 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Scale | **1/32 and 1/24 both from the start**, as two profiles of the same model |
| 2 | Default pod interface | **63.2 × 20 mm four-screw pattern**, editable; other patterns live in the library |
| 3 | Library storage | **One SQLite file on disk**, as Paddock and Timing do |
| 4 | Bought pods | **First-class**, next to generated pods |
| 5 | Name | **SlotForge Frame** (decided 24 November 2026; "Chassis" was the working name, and the project folder still carries it). Design files are `.frame`, library share files `.framelib` |
| 6 | Real parts to measure | **None for now**; the library starts with researched values marked unconfirmed |

What follows from these:

- **Two profiles.** A profile sets the defaults: axle Ø, bushing, tyre sizes, width limit, wheelbase range, plate thickness.

  | Default | 1/32 | 1/24 |
  |---|---|---|
  | Axle | Ø2.38 | Ø3 |
  | Bearing seat | Ø4.75 | Ø6 |
  | Guide hole | 3.7 | 4.8 (3/16") |
  | Max width | 64 | 83 |
  | Wheelbase range | 56–93 | 90–130 |
  | Rear tyre | about 20 × 10.5 | about 27.5 × 13 |
  | Gears | module 0.5 | module 0.5 |

  Values and sources are in [parts-data.md](parts-data.md).
- **1/24 pod pattern is unknown.** The 63.2 × 20 default is measured on 1/32 parts only. No maker publishes a 1/24 pattern (Scaleauto and BRM use metal plates with bolt-on motor and axle holders), so the 1/24 profile starts with a pattern the app proposes from the motor and axle width.
- **Gear mesh is checked by diameter sum.** A pod is designed for one pinion Ø + gear Ø sum (24.5 for Slot.it sidewinder); the check compares the chosen gears against it, which avoids relying on the unconfirmed centre distance.
- **The library is seeded from parts-data.md**: gears, wheels, tyres, axles, screws, motors by can type, and wheelbase presets for about 165 car models.
- **Library on disk** means the app needs file access from the main process, which Anvil does not have. This comes from Paddock's approach instead and is part of M1.
- **Bought pods** start as an empty shelf apart from the four example pods. Each is added by STL import or by typing in measurements.
- **Unconfirmed values are shown as such** in the library and in the checks, so a gear-mesh warning based on an unconfirmed distance says so.

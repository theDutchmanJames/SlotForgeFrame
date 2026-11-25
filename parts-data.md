# SlotForge Chassis — parts data

Second research pass, 24 November 2026: dimensions read from maker catalogues, rule sheets and retailer pages. This is the seed data for the parts library. All sizes in mm.

Marks: **[D]** read in a maker document · **[R]** retailer or third-party figure · **[F]** forum or search snippet, not checked · **[?]** conflicting or doubtful.

Main sources:

- Slot.it Accessories catalogue 2020 and Spare Parts catalogue 2025; Slot.it FAQ sheets
- NSR catalogues 2021 and 2026; NSR Hypercar rules
- Scaleauto "Undercover" technical sheets and rule sheets (scaleauto-slot.com download centre)
- Sloting Plus product pages (sloting.com)
- BRM catalogue, rule sheets and car brochures (brmmodelcars.com)
- Viking Slot Car Club motor table; Slot Car Corner charts; JS Chassis wheelbase list (slotracer.online)

## 1. What no maker publishes

Checked across Slot.it, Policar, NSR, Scaleauto, Sloting Plus and BRM. None of them publishes:

- pod or motor-mount hole patterns, outlines or thickness
- motor-shaft-to-axle distance for any layout
- axle height above the pod base (only "offset" numbers)
- chassis hole positions or plate outlines
- motor can dimensions (one exception: Scaleauto SC-0011C)
- bushing width and flange diameter
- guide post diameter and required hole (Sloting Plus excepted)

These stay as measured-from-parts values. The 63.2 × 20 pod pattern is still only our own measurement of the seven example STLs.

## 2. Axle height and offset

| Maker | Offset → rear axle centre above chassis underside |
|---|---|
| Slot.it [D] | 0 → 7.5 · 0.5 → 8.0 · 0.75 → 8.25 · 1.0 → 8.5 · 1.25 → 8.75 |
| NSR [D] | offsets +0.75 / +1.0 / +1.25 listed; never defined |
| Scaleauto 1/32 [D] | RT3 inline 0.5; anglewinder 0 / −0.25 / −0.5 / −0.75 / −1.0 / −1.15 (sign convention not explained) |
| Scaleauto 1/24 [D] | axle mounts in fixed heights 6 / 7 / 8 / 9 / 10 / 11; shims 0.1 / 0.25 / 0.5 |
| BSCRA rule [D] | minimum, underside to top of axle: 8.4 (2 mm axle), 8.6 (3/32"), 9.0 (1/8") |

Slot.it Flat-6 motor shaft sits 1.25 lower than a Boxer's. [D]

## 3. Gears (all module 0.5)

Rule of thumb: outer Ø = 0.5 × (teeth + 2). Makers break this on purpose to keep one centre distance across tooth counts.

**Mesh check value:** pinion Ø + gear Ø must match the pod's design sum within about ±0.1. [F]

| Pod family | Design sum (pinion Ø + gear Ø) |
|---|---|
| Slot.it sidewinder, 130-size motor | 24.5 (6.5 + 18; or 5.5 + 19; or 7 + 17.5) [F]; catalogue also pairs 6.0 + 19 [D][?] |
| Slot.it anglewinder | about 22 (6.5 + 16, 7 + 15) [F] |
| NSR sidewinder | 24.25 (6.75 + 17.5) [D] |
| NSR anglewinder / Hypercar | 24.3 (7.5 + 16.8) [D] |
| Scaleauto RT3 anglewinder | about 22 (6 + 16) [F] |
| Thunderslot | 24 (7 + 17) [F] |
| Slimline FF-050 sidewinder | 21 (4.5 + 16.5) [F] |

**Sidewinder centre distance:** theory gives sum ÷ 2 − 1.0 (11.25 for Slot.it). Forum posts quote sum ÷ 2 (12.25). No measured value is published. [?]

**Sidewinder / anglewinder gears**

| Maker | Type | Ø | Teeth | Pinion Ø |
|---|---|---|---|---|
| Slot.it [D] | sidewinder spur | 18 | 31–36 | 6.5 |
| Slot.it [D] | sidewinder spur | 19 | 34 / 36 / 38 | 6.0 |
| Slot.it [D] | anglewinder | 16, 18 | 26–36 | 6.5 |
| Slot.it [D] | anglewinder | 15 | 24–26 | 6.75 or 7 |
| NSR [D] | sidewinder | 17.5 | 30–37 | 6.75 |
| NSR [D] | sidewinder, Hypercar | 16.8 | 28–34 | 7.5 |
| NSR [D] | sidewinder for Scalextric/Fly | 18.5 | 34–38 | 6.75 |
| NSR [D] | anglewinder 15° | 16.8 | 27–34 | 7.5 |
| NSR [D] | anglewinder 20° (Ninco) | 17.5 | 31–35 | 6.75 |
| NSR [D] | anglewinder plastic | 16 | 26–33 | 7.5 |
| Scaleauto [D] | anglewinder (RT3) | 15.8 | 25–30 | — |
| Scaleauto [D] | anglewinder | 17 / 18 | 31 / 32 | — |
| Scaleauto [D] | sidewinder (RT4) | 16.5 | 28–33 | — |
| Sloting Plus [D] | anglewinder | 16 | 26–30 | 7 |
| Sloting Plus [D] | anglewinder 11° | 16.8 | 28–31 | — |
| Sloting Plus [D] | sidewinder | 17.5 / 18 | 35–36 / 31–33 | — |
| Scaleauto 1/24 [D] | anglewinder spur, 3 mm axle | — | 38–45 | 7.0 or 7.5 (12–14 T) |
| BRM 1/24 [D] | anglewinder spur | 20.1 / 21 / 21.6 / 22.1 / 22.5 / 23.0 | 38 / 40 / 41 / 42 / 43 / 44 | 6.0–7.3 (10–13 T) |

**Inline crowns**

| Maker | Teeth → outer Ø | Pinion Ø |
|---|---|---|
| Slot.it [D] | 23 → 13.8 · 24 → 14.4 · 25 → 14.8 · 26 → 15.3 · 27 → 15.8 · 28 → 16.3 · 29 → 16.8 · 30 → 17.3 | 5.5 (8–11 T) |
| NSR [D] | 24–27 T, Ø not given | 5.5; EVO3 uses 6.0 |
| Scaleauto [D] | 23–29 T; 26 T is 14.1 | 5.5 |

**Anglewinder angles:** NSR gears marked 15°; NSR "Spanish" mount 11°; NSR Ninco-type gears 20°; NSR Hypercar sidewinder 2.7° [D]. Sloting Plus 11° gears [D]. Slot.it about 25° [F], measured 24.8° on the example pod. Scaleauto 12° or 25° [?].

**Stock ratios:** NSR GT3 anglewinder 13/31, sidewinder 11/32, inline 10/27 [D]. BRM 1/24: 12/33, 11/41, 11/38 [D]. Scaleauto 1/24: 14/44 [D].

## 4. Motors

No maker publishes can drawings; use the Mabuchi outlines in research.md for the can types.

| Can type | L × W × H | Examples |
|---|---|---|
| Short can (FC-130) | 25 × 20 × 15 | Slot.it V12, NSR Shark, Scaleauto SC-0008/0014, BRM S-417/418, Scalextric, Carrera Evo, Ninco NC-1 [R] |
| Short can, FK-130 type | 25 × 20.5 × 15.5 | Plafit Fox/Cheetah, MRRC, Scaleauto SC-05 [R] |
| Long can (FK-180) | 32 × 20.5 × 15.5 | NSR King, Slot.it Boxer, Scaleauto SC-0011C (32 × 20 × 15.3 [D]), SC-0025–0029, BRM S-033, Ninco NC-2…7 [R] |
| Slimline (FF-050) | 26.8 × 15.2 × 11.8 | Slot.it Flat-6, NSR Baby King, Reprotec [R] |
| Box (SH-030) | 19 × 9.5 × 18 | Ninco NK-1 [R] |
| 1/24 "13D" type | 31 × 23.8 × 18.2 | Carrera 1:24, Plafit Hippo/Bison, Scaleauto SC-02 [R] |
| 16D | 33.8 × 23.5 × 16.5 | Parma 16D [R] |

- The club table marks some figures as estimates. [R]
- Shaft Ø2.0 on all short and long cans; shaft sticks out 7.5–8.75 depending on brand. [R]
- Motor screws: M2 × 3 (long can), M2 × 4 (short can) [D]. Policar F1 uses M1.4 × 2.5 [D].

## 5. Axles, bushings, bearings

| Item | Value |
|---|---|
| 1/32 axle | Ø2.38 (3/32"). NSR measures 2.37 [F] |
| 1/32 axle lengths | Slot.it 45 / 48 / 51 / 54 (hollow to 58) · NSR 49 / 54–55 / 60 · Scaleauto 50 / 55 · Sloting Plus 45 to 70 in 2.5 steps [D] |
| 1/24 axle | Ø3; Scaleauto 70 / 75; BRM 58 / 60, stub axles 15.5–20 [D] |
| 1/32 bushing or bearing seat | **Ø4.75** for ball bearings and single-flange bushings; Ø4.6–5.0 for universal bushings (Sloting Plus) [D] |
| 1/32 ball bearing | 2.38 × 4.76 × 2.38, flange 5.94 [F] |
| Slot.it PA02 | body about 4.9, flange about 6.0, flange about 0.65 thick [F] |
| 1/24 bearing | 3 × 6 flanged (Scaleauto SC-1331, BRM S-410); **seat Ø6** (Sloting Plus) [D] |
| Width across the two rear bushings | Slot.it anglewinder pod 29 · Scaleauto RT3 30 · Scaleauto RT4 32.5 (Sloting Plus axle units) [D] |
| Slot.it sidewinder pod width | 33.75; 37.78 with spur [F] |
| Eccentric bushings | NSR 0.1–1.2; Sloting Plus 0.3 / 0.6 [D] |

## 6. Guides

| Guide | Post Ø | Blade length | Blade depth | Thickness |
|---|---|---|---|---|
| Sloting Plus SP1010xx [D] | 3.52 | — | 7 (8.3 for EVO BIG) | — |
| Sloting Plus chassis guide hole [D] | **3.70** | | | |
| Scaleauto SC-1608 (for NSR) [D] | 3.4–3.5 | — | 7 | — |
| Scaleauto 3DP racing SC-1654 [D] | 3.5 | 24.3 | 7 / 8 / 9 / 10 | — |
| Scaleauto universal [R] | 3.7 | — | 7 or 8.3 | — |
| Slot.it CH85d [R] | 3.36 [?] | 21.1 | 6.4 | — |
| Slot.it CH85 / CH84 wood [R] | — | 21 / 26 | 7.3 / 8.87 | — |
| Slot.it-compatible Frankenslot [R] | 3.60 | 22.5 | 6.9 | — |
| NSR 4859 wood [F] | 4 [?] | 19 | 8 | — |
| Scalextric small / large bore [R] | 3.40 / 3.58 upper | 27.6 | 7.2 | 1.87 |
| Carrera deep [R] | — | 31.3 | 8.4 | 2.14 |
| 1/24 Scaleauto [D] | 3/16" (4.8) | — | 9.1 (7 for SC-1602B) | — |
| 1/24 BRM S-026SS [R] | — | 23.5 | 8 | — |

- Slot.it post: catalogue gives none; 3.55–3.6 on forums, 3.36 at one retailer. [?]
- BSCRA maximum blade length 28.5. [D]
- Routed track slot: at least 8 deep (BSCRA), 9 (ISRA), 3–5 wide. [D] Plastic track depths conflict between sources (5 to 7). [?]

## 7. Wheels and tyres

**1/32 wheels, Ø × width**

| Maker | Sizes |
|---|---|
| Slot.it [D] | 14.3 × 8 · 15.8 × 8.2 · 15.8 × 10.2 · 16.5 × 8.2 · 16.5 × 10.2 · 16.9 × 8.2 · 17.3 × 8.2 · 17.3 × 9.75 · 17.3 × 10; hub 0.5 / 1.5 / 2.5 |
| NSR [D] | 13 × 8/10/13 · 16 × 8/10 · 16.5 × 8/10/12 · 17 × 8 (front) · 17 × 10 (rear); "17" is really 17.3, "16" is 15.8 |
| Scaleauto [D] | 15.5 to 17.8 Ø in 8.5 and 10 widths |
| Sloting Plus [D] | 14.2 to 17.8 Ø in 8 / 8.5 / 10 widths |

**1/32 fitted rear tyre:** about 19 to 21 Ø, 10 to 12 wide. NSR's table of mounted diameters on 17.3 wheels runs 17.9 to 23. [D]

**1/24**

| Maker | Front | Rear |
|---|---|---|
| Scaleauto [D] | 25.5 × 8 | 27.5 × 13 on Ø21 hub |
| BRM GT / Legends [D] | 25 × 11 (23 lowered) | 27 × 14.5; Legends 25.5 × 17 |
| BRM Group C [D] | 25 × 14 | 29 × 15.5 |
| BRM Group 2 saloons [R] | 22.5 × 9.5 | 22.5 × 11 |
| Sloting Plus wheels [D] | 17 / 19 / 21 Ø × 8 | 17 / 19 / 21 Ø × 13 |

Wheel fixing: M2 grub on 3/32" axles (M2.5 on Scaleauto and Sloting Plus); M3 grub on 3 mm axles. [D]

## 8. Screws, springs, magnets

| Item | Value |
|---|---|
| Pod screws | Slot.it 2.2 × 5.3 (also 4.5, 9, 11, 13) · NSR 2.2 × 6.5 / 8 · Sloting Plus M2.1 × 6.5 · Scaleauto M2.2 × 5 / 7 / 9, heads 4.3–4.8 [D] |
| Body screws | Slot.it 2.2 × 8 · NSR M2.2 × 6.5 / 8, part-threaded · BRM M2 × 4 / 6 / 8 countersunk [D] |
| Suspension screws | Slot.it L9 / L13 · NSR M2.2 × 8 / 9 / 9.5 · Sloting Plus M2 × 13 [D] |
| Front axle grubs | M2 × 2 / 3 / 6 / 8 / 10 (Slot.it) [D] |
| Springs | NSR free length soft 6–7 / medium 9–10 / hard 14–15; Scaleauto Ø4.3 × 4 or 6; Sloting Plus Ø3 inner × 7 or 10 [D] |
| Magnets | bar 25 × 8 × 2 / 2.3 / 4; discs Ø4 × 1, Ø4 × 1.5, Ø6 × 1.5; NSR 5 × 10 × 2 [D] |
| Ballast | tungsten Ø6.3 × 1; lead sheet 1 / 1.5 / 2 thick [D] |
| Lead wire | NSR 1.8 outer Ø [D] |

## 9. Pod and chassis facts

| Maker | Fact |
|---|---|
| Slot.it [D] | 4 screws; EVO6 adds 2 midway between front and rear. Rear axle sits between the mid and rear screws. |
| NSR [D] | Triangular pods: 3 points. Hypercar pod: 7 points (2 rear, 2 side, 3 front); rules allow 3 to 6 screws. Chassis in five hardness grades. |
| NSR third-party [R] | Inline pod "pitch arms" 42.5 (Boxer) / 48 (Flat-6); old sidewinder pod 78 long |
| Scaleauto 1/32 [D] | RT3 / RT4 pods, 3 to 7 anchor points allowed by rules |
| Scaleauto, Slot.it, Teamslot [F] | said to share one hole pattern; no numbers |
| Scaleauto 1/24 [D] | Steel main plate 1.5 (1.2 option); aluminium or carbon subframes 1.2–1.5; H plate 1.2; base plate 50 or 55 wide; wheelbase 100–130; suspension mounts 1.5 to 6 high |
| BRM 1/24 [D] | Two aluminium plates joined by 4 brass nuts (1.0–3.0 high for small cars, 3.5–4.0 for large); motor pod plate 3 thick; all current cars anglewinder |
| Sloting Plus F1 [D] | aluminium chassis 1.5; stainless motor support 1.2 |

## 10. Sizes and limits

| Item | 1/32 | 1/24 |
|---|---|---|
| Max width | 64 (F1 68); NSR Hypercar 66 [D] | 82–83 [D] |
| Front / rear track | — | LMP 82–83 / 83; GP Classic 73–78 / 79–80; BRM 67–75 / 69–80 [D][R] |
| Wheelbase | 64–90 adjustable; models 56–93 | Scaleauto LMP 124; BRM 90–115; chassis kits 100–130 |
| Guide lead | max 105–110 (BSCRA); NSR Mosler about 100 [D][F] | — |
| Ground clearance | 0.25 to 1.5 by rule set; Scaleauto HY 0.8 | 1.0 (LMP), 3.0 (GP Classic) [D] |
| Plate thickness | NSR F1 measured 1.2 [F]; printed 1.2–2.0 | 1.5 steel |

**Wheelbase presets, 1/32:** a list of about 150 models from a 3D-print chassis maker (JS Chassis), for example Scalextric Mini 63, Capri 75, Sierra 81, Group C 962 83.2; Carrera M3 DTM 85.5, Charger 92.5; Fly 917 74, Lola 83.5; Ninco McLaren 84. Designer's CAD values. [R]

**Wheelbase presets, 1/24 (BRM, retailer figures):** Simca 93 · Kadett 99 · Escort Mk1 100 · Alfa GTA 99 · BMW 2002 104 · Capri 103 · Scirocco 100 · 240Z 93 · Camaro 114 · 917K 90 · 512M 97 · GT40 100 · McLaren F1 115 · 911 GT1 103. Some rows look copied between listings. [R][?]

## 11. Not reached

- Electric Dreams, Pendle, LEB Hobbies, Overdrive and the HRW forum refused automated reading or were not reached.
- SlotForum is closed to automated readers; only search snippets were used.
- The old slot.it technical pages no longer exist.

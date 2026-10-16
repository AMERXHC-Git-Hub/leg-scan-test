/* Instruction content and illustrations for each photo.
   Each photo has: a top-down setup diagram, a "your photo should look like this" view,
   numbered steps, and a list of things to avoid (each matches a problem the app cannot correct). */
(function(){
"use strict";
const T = (x, y, s, o) => `<text x="${x}" y="${y}" font-size="${(o&&o.size)||10.5}" fill="${(o&&o.fill)||"var(--ink)"}" text-anchor="${(o&&o.anchor)||"start"}" font-weight="${(o&&o.w)||400}" stroke="none">${s}</text>`;
const lines = (x, y, arr, o) => arr.map((s, i) => T(x, y + i*12.5, s, o)).join("");
const arrowDefs = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--tape-ink)" stroke="none"/></marker></defs>`;
const svg = (h, body, label) => `<svg viewBox="0 0 300 ${h}" role="img" aria-label="${label}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" font-family="var(--f-body)">${arrowDefs}${body}</svg>`;
const wall = `<rect x="8" y="6" width="284" height="12" rx="2" fill="var(--line)" stroke="none"/>${T(150, 15.5, "WALL", { anchor: "middle", size: 8.5, fill: "var(--muted)", w: 600 })}`;
const phoneTop = (x, y) => `<rect x="${x-10}" y="${y}" width="20" height="32" rx="4" fill="var(--surface)"/><circle cx="${x}" cy="${y+6}" r="2.2" fill="currentColor" stroke="none"/>`;
const cardFill = `fill="var(--card)" fill-opacity=".18" stroke="var(--card)" stroke-width="2.2"`;
const legFill = `fill="var(--leg)" fill-opacity=".22" stroke="var(--leg)" stroke-width="2"`;
const otherFill = `fill="none" stroke="var(--muted)" stroke-dasharray="4 3"`;
// footprint seen from above, heel at the top, toes at the bottom, centered on x
const footDown = (x, y, attrs) => `<path transform="translate(${x} ${y})" ${attrs} d="M0 0 c12 0 17 10 17 22 c0 14 -3 26 2 40 c4 12 3 28 -19 28 c-22 0 -23 -16 -19 -28 c5 -14 2 -26 2 -40 c0 -12 5 -22 17 -22 z"/>`;
// footprint seen from above, heel at the left, toes at the right
const footRight = (x, y, attrs) => `<path transform="translate(${x} ${y})" ${attrs} d="M0 0 c0 -12 10 -17 22 -17 c14 0 26 3 40 -2 c12 -4 28 -3 28 19 c0 22 -16 23 -28 19 c-14 -5 -26 -2 -40 -2 c-12 0 -22 -5 -22 -17 z"/>`;
const frame = `<rect x="95" y="8" width="120" height="213" rx="12" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/><path d="M97 150 H213 V209 Q213 219 203 219 H107 Q97 219 97 209 Z" fill="var(--line)" stroke="none"/>`;
const leader = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="var(--muted)" stroke-width="1"/><circle cx="${x2}" cy="${y2}" r="2" fill="var(--muted)" stroke="none"/>`;

const frontSetup = svg(232,
  wall +
  footDown(120, 40, legFill) + footDown(186, 40, otherFill) +
  `<rect x="70" y="42" width="25" height="40" rx="2" ${cardFill}/>` +
  lines(82, 97, ["Card,", "beside", "ankle"], { anchor: "middle", size: 9.5, fill: "var(--card)", w: 600 }) +
  lines(120, 33, ["Measured leg"], { anchor: "middle", size: 9.5, fill: "var(--leg)", w: 600 }) +
  lines(186, 33, ["Other foot"], { anchor: "middle", size: 9.5, fill: "var(--muted)" }) +
  `<path d="M140 112 H166" stroke="var(--tape-ink)" stroke-width="1.4" marker-start="url(#ah)" marker-end="url(#ah)"/>` +
  lines(212, 108, ["Feet a fist", "apart, not", "touching"], { size: 9.5 }) +
  `<path d="M120 188 V136" stroke="var(--tape-ink)" stroke-width="1.6" stroke-dasharray="4 3" marker-start="url(#ah)" marker-end="url(#ah)"/>` +
  lines(112, 160, ["60–90 cm", "(2–3 ft)"], { anchor: "end", size: 10, w: 600 }) +
  phoneTop(120, 194) + lines(140, 206, ["Phone upright,", "at knee height"], { size: 9.5 }),
  "Seen from above: the patient faces the phone, feet a fist apart, card flat on the floor beside the outside of the measured ankle, phone 60 to 90 centimeters in front.");

const frontPhoto = svg(240,
  frame +
  `<path ${legFill} d="M123 8 C121 30 120 50 122 75 C124 100 134 120 135 140 L133 158 C128 170 126 182 134 186 L158 186 C166 182 164 170 159 158 L157 140 C158 120 168 100 170 75 C172 50 171 30 169 8"/>` +
  `<path ${otherFill} d="M192 8 C190 50 194 90 197 140 L195 160 C192 175 193 185 201 186 L213 186"/>` +
  `<path d="M128 26 Q146 34 164 26" stroke="var(--leg)" stroke-width="1.4"/>` +
  `<path d="M104 166 L123 166 L125 178 L101 178 Z" ${cardFill}/>` +
  leader(88, 28, 125, 28) + lines(86, 25, ["Knee near", "the top"], { anchor: "end", size: 9.5 }) +
  leader(88, 172, 104, 172) + lines(86, 166, ["Whole card", "in view, level", "with the ankle"], { anchor: "end", size: 9.5, fill: "var(--card)", w: 600 }) +
  leader(222, 100, 196, 100) + lines(224, 97, ["Other leg", "apart, not", "touching"], { size: 9.5 }) +
  leader(222, 203, 160, 203) + lines(224, 200, ["Floor below", "the foot"], { size: 9.5 }),
  "The photo: measured leg in the middle, knee near the top, whole foot and card at the bottom, other leg apart.");

const sideSetup = svg(232,
  wall +
  footRight(95, 98, legFill) + footRight(48, 50, otherFill) +
  lines(88, 96, ["Measured", "leg"], { anchor: "end", size: 9.5, fill: "var(--leg)", w: 600 }) +
  lines(158, 46, ["Other foot one", "step back"], { size: 9.5, fill: "var(--muted)" }) +
  `<rect x="108" y="130" width="40" height="25" rx="2" ${cardFill}/>` +
  lines(156, 138, ["Card a hand's", "width in front", "of the foot"], { size: 9.5, fill: "var(--card)", w: 600 }) +
  phoneTop(128, 194) + lines(110, 206, ["Phone upright,", "at knee height"], { anchor: "end", size: 9.5 }) +
  `<path d="M190 98 H246 M140 210 H246" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 3"/>` +
  `<path d="M246 101 V207" stroke="var(--tape-ink)" stroke-width="1.6" stroke-dasharray="4 3" marker-start="url(#ah)" marker-end="url(#ah)"/>` +
  lines(252, 150, ["60–90", "cm", "(2–3 ft)"], { size: 10, w: 600 }),
  "Seen from above: the phone is at the outside of the measured leg, the other foot is one step back, and the card is flat on the floor a hand's width in front of the foot.");

const sidePhoto = svg(240,
  frame +
  `<path ${legFill} d="M128 8 C126 40 130 90 136 140 L134 160 C130 174 130 184 140 186 L200 186 C208 184 206 176 198 174 L170 166 C162 160 160 150 160 140 C162 110 176 90 174 60 C172 35 168 20 168 8"/>` +
  `<circle cx="128" cy="30" r="4" fill="var(--tape)" stroke="var(--tape-ink)" stroke-width="1.2"/>` +
  `<path d="M141 197 L182 197 L187 210 L136 210 Z" ${cardFill}/>` +
  leader(88, 30, 124, 30) + lines(86, 22, ["Bump below", "the kneecap", "in view"], { anchor: "end", size: 9.5 }) +
  leader(88, 160, 134, 178) + lines(86, 150, ["Heel and", "toes both", "in view"], { anchor: "end", size: 9.5 }) +
  leader(222, 204, 187, 204) + lines(224, 198, ["Whole card", "in view"], { size: 9.5, fill: "var(--card)", w: 600 }) +
  leader(222, 80, 174, 80) + lines(224, 77, ["Only the", "measured leg"], { size: 9.5 }),
  "The photo: side of the measured leg, the bump below the kneecap near the top, heel and toes in view, card in front of the foot.");

/* Where each measurement is taken, drawn from the product's own measures. */
function anatomy(measures){
  const m = measures || {};
  let s = `<path ${legFill} d="M98 10 C96 40 100 90 106 150 L104 168 C100 182 100 194 110 196 L190 196 C198 194 196 186 188 184 L142 176 C134 170 132 160 132 150 C134 118 150 96 148 64 C146 38 142 22 142 10"/>` +
    `<path d="M40 198 H260" stroke="var(--muted)"/>` + T(250, 210, "Floor", { anchor: "end", size: 9, fill: "var(--muted)" });
  if (m.calf) s += `<ellipse cx="124" cy="78" rx="27" ry="6" stroke="var(--tape-ink)" stroke-width="2"/>` + leader(178, 78, 152, 78) +
    lines(182, 76, [`<tspan font-weight="700">${m.calf.letter} · Calf</tspan>`, "Widest part of", "the calf muscle"], { size: 10 });
  if (m.ankle) s += `<ellipse cx="117" cy="150" rx="15" ry="4.5" stroke="var(--tape-ink)" stroke-width="2"/>` + leader(178, 150, 133, 150) +
    lines(182, 148, [`<tspan font-weight="700">${m.ankle.letter} · Ankle</tspan>`, "Just above the", "ankle bone"], { size: 10 });
  if (m.length) s += `<circle cx="97" cy="30" r="4" fill="var(--tape)" stroke="var(--tape-ink)" stroke-width="1.2"/>` +
    `<path d="M78 33 V195" stroke="var(--tape-ink)" stroke-width="1.6" marker-start="url(#ah)" marker-end="url(#ah)"/><path d="M78 30 H93" stroke="var(--tape-ink)" stroke-width="1" stroke-dasharray="2 2"/>` +
    lines(72, 96, [`<tspan font-weight="700">${m.length.letter} · Leg</tspan>`, "<tspan font-weight=\"700\">length</tspan>", "Floor to the", "bump below", "the kneecap"], { anchor: "end", size: 10 });
  return svg(218, s, "Where the app measures: " + Object.values(m).map(x => `${x.label}, ${x.where}`).join("; "));
}

/* Side view of the knee for the leg-length tap. */
const kneeTap = svg(120,
  `<path ${legFill} d="M120 0 C118 12 110 20 110 32 C110 44 118 50 119 58 C120 63 116 68 118 74 C121 88 121 104 123 120 L210 120 C208 90 216 50 214 0 Z"/>` +
  `<ellipse cx="114" cy="31" rx="8" ry="13" fill="var(--surface)" stroke="var(--leg)" stroke-width="1.6"/>` +
  `<circle cx="118" cy="68" r="5.5" fill="var(--tape)" stroke="var(--tape-ink)" stroke-width="1.4"/>` +
  leader(92, 31, 106, 31) + lines(88, 34, ["Kneecap"], { anchor: "end", size: 10, fill: "var(--muted)" }) +
  leader(92, 68, 112, 68) + lines(88, 62, ["<tspan font-weight=\"700\">Tap here:</tspan>", "the bony bump", "just below", "the kneecap"], { anchor: "end", size: 10 }) +
  lines(166, 64, ["Side view", "of the knee"], { anchor: "middle", size: 9.5, fill: "var(--muted)" }),
  "The tibial tuberosity is the bony bump on the front of the shin just below the kneecap.");

window.GUIDES = {
  anatomy, kneeTap,
  front: {
    title: "Front of the leg",
    setup: frontSetup, photo: frontPhoto,
    steps: [
      "Have the patient stand facing you, weight on both feet, with the feet <b>a fist's width apart</b> so the legs do not touch.",
      "Lay the card <b>flat on the floor, face down</b>, right beside the <b>outside of the ankle</b> being measured, long side along the foot. The card must be level with the ankle, not in front of the toes.",
      "Crouch or kneel <b>60–90 cm (2–3 ft)</b> in front of the measured leg, about an arm's length. Hold the phone <b>upright</b> at <b>knee height</b>, not waist height, tilted slightly down.",
      "The lower leg should <b>fill the screen from top to bottom</b>: knee near the top, the <b>whole foot and the whole card</b> at the bottom. If you can see the hips, you are too far away.",
      "Turn the flash off, hold still, and take the photo."
    ],
    avoid: [
      "Standing back so the hips or the whole body are in the photo (too far away to measure)",
      "Card held in a hand, propped against the leg, or standing on its edge",
      "Card in front of the toes instead of beside the ankle",
      "Card touching or partly under the foot",
      "Feet or legs touching each other",
      "Hands, pets, bags or clothing next to the leg",
      "Socks, or loose pants below the knee"
    ]
  },
  side: {
    title: "Side of the leg",
    setup: sideSetup, photo: sidePhoto,
    steps: [
      "Move to the <b>outside of the measured leg</b>, so the leg is side-on to the phone.",
      "Ask the patient to move the <b>other foot one step back</b>, keeping weight on both feet, so it does not show behind the measured leg.",
      "Lay the card <b>flat on the floor, face down</b>, about <b>a hand's width (10 cm) in front of the foot</b> on your side, under the ankle, long side along the foot.",
      "Crouch or kneel <b>60–90 cm (2–3 ft)</b> away, about an arm's length. Hold the phone <b>upright</b> at <b>knee height</b>, not waist height, tilted slightly down.",
      "The lower leg should <b>fill the screen from top to bottom</b>: the <b>bump below the kneecap</b> near the top, the <b>heel, toes and whole card</b> at the bottom. If you can see the hips, you are too far away."
    ],
    avoid: [
      "Standing back so the hips or the whole body are in the photo (too far away to measure)",
      "The other foot next to the measured foot, where it shows behind it",
      "Heel or toes cut off at the edge of the photo",
      "Card hidden by the foot or cut off at the edge",
      "Card held in a hand or standing on its edge",
      "Hands, pets, bags or clothing next to the leg"
    ]
  },
  foot: {
    title: "Foot from the front",
    setup: frontSetup, photo: frontPhoto,
    steps: [
      "Lay the card flat on the floor in front of the toes.",
      "Hold the phone above and in front of the foot, looking down at it.",
      "Fit the whole foot and the whole card in the photo."
    ],
    avoid: ["Card touching or partly under the foot", "Toes or heel cut off at the edge of the photo"]
  },
  before: [
    { t: "A standard-size card", d: "Any bank, ID or gift card (85.6 × 54 mm). Lay it <b>face down</b> so no card number shows." },
    { t: "Floor darker than the card", d: "On a white or very light floor, put a dark towel or mat under the foot and the card." },
    { t: "Leg bare, or tight leggings", d: "Remove socks. Roll loose pants up above the knee. Anything loose is measured as part of the leg." },
    { t: "A clear area", d: "No pets, bags, cords or other objects near the leg. Even room light, flash off." },
    { t: "Patient stands still", d: "Weight on both feet for both photos. Retake both photos if the patient moves the measured leg." }
  ]
};
})();

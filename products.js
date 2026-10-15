/* Product sizing data. To add a product, add an entry to PRODUCTS.
   Ranges are inclusive. A size fits when the measurement is inside its centimeter or its inch range, as printed on the chart.
   "rules": "ankleCalf" applies the Extremit-Ease fitting tips:
     same size                         -> that size
     calf one size larger than ankle   -> calf size
     ankle one size larger than calf   -> ankle size
     more than one size apart          -> prescribed custom garment only
     ankle AND calf between sizes      -> physician's choice (clinician confirms)
   A single measurement that falls in two sizes is resolved by trying both and keeping the outcome the
   fitting tips resolve best (same size, then one size apart, then custom). */
window.PRODUCTS = [
  {
    id: "extremit-ease-garment",
    name: "Extremit-Ease Compression Garment",
    short: "Day garment",
    available: true,
    photos: ["front", "side"],
    rules: "ankleCalf",
    measures: {
      ankle:  { letter: "A", label: "Ankle",      where: "Just above the ankle bone" },
      calf:   { letter: "C", label: "Calf",       where: "Widest part of the calf muscle" },
      length: { letter: "L", label: "Leg length", where: "Floor to the bony bump below the knee (tibial tuberosity)" }
    },
    sizes: [
      { name: "Extra Small", code: "XS",  ankle: { cm: [21, 25], in: [8.5, 10] },   calf: { cm: [37, 42], in: [14.5, 16.5] } },
      { name: "Small",       code: "S",   ankle: { cm: [25, 30], in: [10, 11.5] },  calf: { cm: [42, 47], in: [16.5, 18.5] } },
      { name: "Medium",      code: "M",   ankle: { cm: [30, 33], in: [11.5, 13] },  calf: { cm: [47, 52], in: [18.5, 20.5] } },
      { name: "Large",       code: "L",   ankle: { cm: [33, 37], in: [13, 14.5] },  calf: { cm: [52, 57], in: [20.5, 22.5] } },
      { name: "Extra Large", code: "XL",  ankle: { cm: [37, 41], in: [14.5, 16] },  calf: { cm: [57, 62], in: [22.5, 24.5] } },
      { name: "2X Large",    code: "2XL", ankle: { cm: [39, 43], in: [15.5, 17] },  calf: { cm: [62, 67], in: [24.5, 26.5] } }
    ],
    lengths: [
      { name: "Regular", cm: [37, 44], in: [14.5, 17.5] },
      { name: "Tall",    cm: [44, 51], in: [17.5, 20] }
    ]
  },
  { id: "extremit-ease-night",  name: "Extremit-Ease Night Garment",            short: "Night garment", available: false },
  { id: "extremit-ease-liner",  name: "Extremit-Ease Liner",                    short: "Liner",         available: false },
  { id: "extremit-ease-ankle-foot", name: "Extremit-Ease Ankle and Foot Garment", short: "Ankle and foot (coming soon)", available: false }
];

/* ---------- sizing engine ---------- */
window.Sizing = (function(){
  const r1 = v => Math.round(v * 10) / 10;
  // A size fits when the measurement is inside its centimeter range or its inch range as printed on the chart.
  function candidates(sizes, key, cm){
    const v = r1(cm), vin = r1(cm / 2.54), out = [];
    sizes.forEach((s, i) => { const c = s[key].cm, n = s[key].in;
      if ((v >= c[0] && v <= c[1]) || (n && vin >= n[0] && vin <= n[1])) out.push(i); });
    return out;
  }
  function pairOutcome(a, c){
    const d = c - a;
    if (d === 0) return { rank: 0, size: a, tip: "same" };
    if (d === 1) return { rank: 1, size: c, tip: "calfLarger" };
    if (d === -1) return { rank: 1, size: a, tip: "ankleLarger" };
    return { rank: 2, size: null, tip: "custom" };
  }
  function ankleCalf(product, ankleCm, calfCm){
    const S = product.sizes, A = candidates(S, "ankle", ankleCm), C = candidates(S, "calf", calfCm);
    const res = { ankleSizes: A, calfSizes: C };
    if (!A.length || !C.length){
      res.outcome = "custom"; res.reason = `The ${!A.length ? "ankle" : "calf"} measurement is outside the size chart.`;
      return res;
    }
    if (A.length > 1 && C.length > 1){
      res.outcome = "physician"; res.options = Array.from(new Set(A.concat(C))).sort((x, y) => x - y);
      res.reason = "Both the ankle and calf measurements fall between sizes.";
      return res;
    }
    let best = null;
    A.forEach(a => C.forEach(c => { const o = pairOutcome(a, c); o.a = a; o.c = c; if (!best || o.rank < best.rank) best = o; }));
    res.pair = [best.a, best.c];
    if (best.tip === "custom"){
      res.outcome = "custom"; res.reason = "The ankle and calf are more than one size apart, so a standard garment should not be used.";
    } else {
      res.outcome = "size"; res.size = best.size;
      res.reason = {
        same: "The ankle and calf measurements are the same size.",
        calfLarger: "The calf is one size larger than the ankle, so the size is based on the calf.",
        ankleLarger: "The ankle is one size larger than the calf, so the size is based on the ankle."
      }[best.tip];
    }
    return res;
  }
  function lengthOf(product, cm){
    if (!product.lengths || cm == null) return null;
    const v = r1(cm), L = product.lengths;
    // Inclusive ranges share their end points; a value on a shared end point goes to the longer length.
    for (let i = L.length - 1; i >= 0; i--){ const [lo, hi] = L[i].cm; if (v >= lo && v <= hi) return { index: i }; }
    return { index: -1 };
  }
  return { candidates, ankleCalf, lengthOf };
})();

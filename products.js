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
  {
    id: "extremit-ease-night",
    name: "Extremit-Ease Night Garment",
    short: "Night garment · ankle and calf",
    available: true,
    photos: ["front", "side"],
    rules: "overlap",
    measures: {
      ankle: { letter: "A", label: "Ankle", where: "Just above the ankle" },
      calf:  { letter: "C", label: "Calf",  where: "Widest part of the calf muscle" }
    },
    sizes: [
      { name: "Size 3", code: "3", ankle: { cm: [25, 33], in: [10, 13] }, calf: { cm: [37, 47], in: [14.5, 18.5] } },
      { name: "Size 4", code: "4", ankle: { cm: [28, 35], in: [11, 14] }, calf: { cm: [41, 52], in: [16, 20.5] } },
      { name: "Size 5", code: "5", ankle: { cm: [33, 41], in: [13, 16] }, calf: { cm: [44, 57], in: [17.5, 22.5] } },
      { name: "Size 6", code: "6", ankle: { cm: [38, 43], in: [15, 17] }, calf: { cm: [48, 60], in: [19, 24] } }
    ]
  },
  {
    id: "extremit-ease-liner",
    name: "Extremit-Ease Liner",
    short: "Liner · sized by shoe size",
    available: true,
    photos: [],
    rules: "shoe",
    sizes: [
      { name: "Small",       code: "S",   men: [5.5, 7.5],  women: [7, 9] },
      { name: "Medium",      code: "M",   men: [7.5, 9.5],  women: [9, 11] },
      { name: "Large",       code: "L",   men: [9.5, 11.5], women: [11, 13] },
      { name: "Extra Large", code: "XL",  men: [11.5, 13],  women: [13, 14.5] },
      { name: "XX Large",    code: "XXL", men: [11.5, 15],  women: [13, 15], note: "Fits the same shoe sizes as Extra Large, with an extra inch of growth room." }
    ]
  },
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
  /* Shoe-size products: a shoe size inside more than one size range is between sizes, and the clinician chooses. */
  function shoe(product, who, size){
    const C = []; product.sizes.forEach((s, i) => { const r = s[who]; if (size >= r[0] && size <= r[1]) C.push(i); });
    if (!C.length) return { outcome: "custom", candidates: C, reason: "This shoe size is outside the liner size chart." };
    if (C.length > 1) return { outcome: "physician", candidates: C, options: C, reason: `A ${who === "men" ? "men's" : "women's"} size ${size} fits more than one liner size.` };
    return { outcome: "size", candidates: C, size: C[0], reason: `A ${who === "men" ? "men's" : "women's"} size ${size} is in the ${product.sizes[C[0]].name} range.` };
  }
  /* "overlap" products (night garment): a size fits when it covers both the ankle and the calf.
     One fitting size -> that size. Several -> suggest the larger (step down gradually), flagged as between sizes.
     None -> no single size covers both; shown to the clinician to decide. */
  function overlap(product, ankleCm, calfCm){
    const S = product.sizes, A = candidates(S, "ankle", ankleCm), C = candidates(S, "calf", calfCm);
    const both = A.filter(i => C.includes(i)), res = { ankleSizes: A, calfSizes: C, both };
    if (!A.length || !C.length){ res.outcome = "custom"; res.reason = `The ${!A.length ? "ankle" : "calf"} measurement is outside the size chart.`; return res; }
    if (both.length === 1){ res.outcome = "size"; res.size = both[0]; res.reason = `${S[both[0]].name} is the only size that covers both the ankle and the calf.`; return res; }
    if (both.length > 1){
      // Overlapping sizes let the leg step down gradually; start with the larger size so pressure is not raised too quickly.
      const big = Math.max(...both); res.outcome = "size"; res.size = big; res.between = both;
      res.reason = `Both the ankle and the calf fit ${both.map(i => S[i].name).join(" and ")}. The larger size is suggested so the leg can step down gradually; moving down more than one size at a time can raise the pressure too quickly.`;
      return res;
    }
    res.outcome = "physician"; res.noCommon = true; res.options = Array.from(new Set(A.concat(C))).sort((x,y) => x-y);
    res.options.push(-1); // -1 = custom garment
    res.reason = "No single size covers both the ankle and the calf, so this patient may need a custom garment.";
    return res;
  }
  return { candidates, ankleCalf, lengthOf, shoe, overlap };
})();

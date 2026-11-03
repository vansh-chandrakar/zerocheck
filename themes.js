(function () {
  const RAW = [
    ['obsidian','Obsidian','Roman architecture, polished obsidian, quiet luxury','#101010','#191919','#222222','#E8E2D6','#A49B8C','#B99A5B','#302819','#39342B','Cinzel','Inter'],
    ['nocturne','Nocturne','Quiet midnight, moonlight, understated elegance','#101725','#172235','#202E43','#E3E9F2','#9BA9BC','#A9BBD2','#26374C','#344256','Cormorant Garamond','Manrope'],
    ['imperial','Imperial','Imperial chambers, classical authority, regal restraint','#1B1014','#28171D','#352129','#F0E5DF','#B7A19D','#C4A05A','#402A2B','#51363A','Cinzel','Lato'],
    ['parchment','Parchment','Antique manuscripts, archival paper, classical scholarship','#E9DFC9','#F2EADB','#FAF5E9','#382D23','#786A58','#947044','#DED0B5','#CDBD9F','EB Garamond','Source Sans 3'],
    ['monolith','Monolith','Monumental minimalism, stone, precision','#151719','#202326','#2A2F33','#E2E5E6','#9CA4A8','#9BA9B1','#303A40','#41494D','Space Grotesk','Inter'],
    ['versailles','Versailles','French classical interiors, delicate luxury, refined ornament','#F1EBDD','#F8F4EA','#FFFCF5','#44382D','#887967','#B39462','#E8DCC5','#D9CCB4','Cormorant Garamond','Montserrat'],
    ['renaissance','Renaissance','Renaissance libraries, botanical manuscripts, old-world intellect','#1C211A','#282F23','#343C2D','#E7E4D5','#B0AE98','#A9A276','#3C4030','#4B4E3C','IM Fell English','Source Sans 3'],
    ['midnight','Midnight','Midnight observatory, calm depth, intellectual focus','#0D1424','#151F33','#1E2B43','#E1E8F4','#98A8C0','#718DBA','#263955','#34445F','Libre Baskerville','Inter'],
    ['eclipse','Eclipse','Solar eclipse, dark bronze, dramatic restraint','#100F0D','#1B1915','#26221C','#E8E1D5','#A69A88','#B47C48','#38291D','#40372C','Bodoni Moda','DM Sans'],
    ['oxford','Oxford','Traditional university libraries, leather-bound books, academic heritage','#142019','#1D2B22','#29392E','#E7E8D9','#AAB4A2','#B7B18A','#334337','#435447','Libre Baskerville','Lato'],
    ['sepia','Sepia','Old photographs, archival documents, vintage warmth','#211913','#30231A','#3D2D21','#E9D9C2','#B8A48A','#C09258','#493523','#5B4632','Special Elite','Lora'],
    ['aurelian','Aurelian','Royal manuscripts, velvet-dark purple, classical grandeur','#191323','#251B34','#322544','#E9E1F0','#B2A5C2','#C3A36A','#3A2D48','#4C3C5C','Cormorant Garamond','Manrope'],
    ['arctic','Arctic','Nordic clarity, winter light, clean sophistication','#EDF2F5','#F7FAFC','#FFFFFF','#26333D','#748490','#7296AD','#DCE8EF','#D0DCE3','DM Serif Display','Inter'],
    ['bloodstone','Bloodstone','Dark garnet, dramatic classicism, controlled intensity','#170F12','#24171B','#322025','#E9DFDF','#B09A9D','#A84D59','#3B2028','#503039','Playfair Display','IBM Plex Sans'],
    ['emerald','Emerald','Emerald stone, botanical luxury, quiet richness','#101B17','#192720','#23352B','#E3EAE2','#A2B2A5','#B49A58','#2B4034','#405548','Cormorant Garamond','Inter'],
    ['graphite','Graphite','Editorial minimalism, technical precision, monochrome design','#171819','#222426','#2C2F31','#E5E6E6','#A3A6A8','#C2C5C7','#35393C','#45494C','IBM Plex Mono','IBM Plex Sans'],
    ['celestial','Celestial','Celestial maps, distant galaxies, subtle cosmic atmosphere','#111322','#1B1D34','#262947','#E8E6F3','#AAA9C5','#9A8BC8','#34314F','#46425F','Space Grotesk','DM Sans'],
    ['copperfield','Copperfield','Artisanal metalwork, aged copper, warm craftsmanship','#1B1511','#292019','#382A20','#E9DED2','#B7A18E','#C08055','#473023','#594132','Fraunces','Work Sans'],
    ['porcelain','Porcelain','Fine porcelain, understated refinement, soft minimalism','#F2F2EF','#FAFAF8','#FFFFFF','#303437','#858B8D','#8D9A9F','#E4E8E8','#D9DEDE','DM Serif Display','Manrope'],
    ['abyss','Abyss','Deep ocean, mysterious stillness, restrained aquatic elegance','#0C1718','#142324','#1D3031','#DDE9E6','#98B0AC','#75A69B','#253D3B','#38504C','Cormorant Garamond','Plus Jakarta Sans']
  ];
  const LIST = RAW.map((a) => ({ id: a[0], name: a[1], mood: a[2], bg: a[3], surface: a[4], raised: a[5], text: a[6], muted: a[7], accent: a[8], soft: a[9], border: a[10], hf: a[11], bf: a[12] }));

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => {
    const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  const SANS_HEAD = ['Space Grotesk'], MONO_HEAD = ['IBM Plex Mono'], SERIF_BODY = ['Lora'];
  const headStack = (f) => `"${f}", ` + (MONO_HEAD.includes(f) ? 'ui-monospace, monospace' : SANS_HEAD.includes(f) ? 'system-ui, sans-serif' : 'Georgia, serif');
  const bodyStack = (f) => `"${f}", ` + (SERIF_BODY.includes(f) ? 'Georgia, serif' : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');

  function loadFonts(t) {
    const enc = (n) => n.replace(/ /g, '+');
    let q = 'family=' + enc(t.hf);
    if (t.bf !== t.hf) q += '&family=' + enc(t.bf) + ':wght@' + (t.bf === 'Lato' ? '400;700' : '400;500;600');
    const href = `https://fonts.googleapis.com/css2?${q}&display=swap`;
    let link = document.getElementById('zc-fonts');
    if (!link) { link = document.createElement('link'); link.id = 'zc-fonts'; link.rel = 'stylesheet'; document.head.appendChild(link); }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }

  function apply(id) {
    const t = LIST.find((x) => x.id === id) || LIST[0];
    const root = document.documentElement, s = root.style;
    const dark = lum(t.bg) < 0.4;
    const darkEnd = dark ? t.bg : t.text;
    const [r, g, b] = rgb(t.accent);
    const set = (k, v) => s.setProperty(k, v);
    set('--bg', t.bg); set('--card', t.surface); set('--raised', t.raised);
    set('--text', t.text); set('--muted', t.muted); set('--line', t.border);
    set('--soft', t.soft); set('--ink', t.accent);
    set('--ink-text', contrast(t.accent, '#FFFFFF') >= contrast(t.accent, darkEnd) ? '#FFFFFF' : darkEnd);
    set('--glow', `rgba(${r},${g},${b},.14)`);
    set('--shadow', dark ? '0 1px 2px rgba(0,0,0,.5), 0 18px 40px rgba(0,0,0,.45)' : '0 1px 2px rgba(60,40,20,.06), 0 18px 40px rgba(60,40,20,.10)');
    set('--display', headStack(t.hf)); set('--body', bodyStack(t.bf));
    s.colorScheme = dark ? 'dark' : 'light';
    root.dataset.theme = t.id;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.bg);
    loadFonts(t);
    try { localStorage.setItem('zc_theme', t.id); } catch (e) {}
  }

  let stored = null;
  try { stored = localStorage.getItem('zc_theme'); } catch (e) {}
  if (!LIST.some((x) => x.id === stored)) stored = matchMedia('(prefers-color-scheme: light)').matches ? 'porcelain' : 'obsidian';
  window.ZCThemes = { list: LIST, apply, current: () => document.documentElement.dataset.theme };
  apply(stored);
})();

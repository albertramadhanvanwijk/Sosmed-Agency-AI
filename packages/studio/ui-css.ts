/**
 * Gaya antarmuka Studio — pola Admin Dashboard.
 *
 * Dipisah dari berkas komposisi HTML karena dua alasan: berkasnya menjadi jauh
 * lebih mudah ditelusuri, dan gaya dapat diubah tanpa menyentuh struktur maupun
 * skrip. Versi sebelumnya mencoba memuat semuanya dalam satu berkas, dan itu
 * menyulitkan perawatan.
 */
export const STUDIO_CSS = `
:root {
  --bg: #0A0E17;
  --side: #0D1220;
  --top: #111827;
  --panel: #121A2B;
  --panel-2: #172033;
  --panel-3: #1D2740;
  --line: #232F47;
  --line-soft: #1B2439;
  --text: #E8EEF7;
  --muted: #8FA1BC;
  --dim: #61748F;
  --accent: #3B82F6;
  --accent-2: #22D3EE;
  --ok: #22C55E;
  --warn: #F59E0B;
  --danger: #EF4444;
  --r: 10px;
  --shadow: 0 4px 20px rgba(0,0,0,.4);
  --side-w: 232px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', Inter, system-ui, -apple-system, sans-serif;
  font-size: 13.5px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ===================== TATA LETAK ADMIN ===================== */

.layout { display: flex; min-height: 100vh; }

.side {
  width: var(--side-w); flex: 0 0 var(--side-w);
  background: var(--side); border-right: 1px solid var(--line);
  position: fixed; top: 0; bottom: 0; left: 0; overflow-y: auto;
  display: flex; flex-direction: column;
}
.side-brand { padding: 16px 18px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 10px; }
.side-brand .mark {
  width: 34px; height: 34px; border-radius: 9px; flex: 0 0 auto;
  background: linear-gradient(145deg, var(--accent-2), var(--accent));
  display: grid; place-items: center; font-weight: 800; color: #05101E; font-size: 15px;
}
.side-brand h1 { font-size: 14.5px; font-weight: 700; letter-spacing: -.01em; }
.side-brand small { display: block; color: var(--dim); font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }

.side-nav { padding: 10px 8px; flex: 1 1 auto; }
.side-nav .group { color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; padding: 14px 10px 6px; }
.side-nav button {
  display: flex; align-items: center; gap: 10px; width: 100%;
  background: transparent; border: 0; color: var(--muted); cursor: pointer;
  padding: 9px 10px; border-radius: 8px; font-size: 13.5px; font-weight: 600;
  font-family: inherit; text-align: left; transition: all .12s;
}
.side-nav button:hover { background: rgba(255,255,255,.05); color: var(--text); }
.side-nav button.on { background: linear-gradient(145deg, rgba(59,130,246,.22), rgba(34,211,238,.14)); color: #fff; }
.side-nav button .ic { width: 18px; text-align: center; font-size: 14px; opacity: .9; }
.side-nav button .pill {
  margin-left: auto; background: var(--danger); color: #fff;
  font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 999px; min-width: 18px; text-align: center;
}
.side-foot { padding: 12px 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--dim); line-height: 1.6; }

.main { margin-left: var(--side-w); flex: 1 1 auto; min-width: 0; }

.top {
  background: var(--top); border-bottom: 1px solid var(--line);
  padding: 12px 22px; display: flex; align-items: center; gap: 14px;
  position: sticky; top: 0; z-index: 20;
}
.crumb { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.crumb b { color: var(--text); font-weight: 700; font-size: 15px; }
.top .spacer { flex: 1 1 auto; }

.work { padding: 20px 22px 70px; }

/* ===================== KOMPONEN ===================== */

.card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
.card + .card { margin-top: 16px; }
.card-h { padding: 13px 16px; border-bottom: 1px solid var(--line-soft); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.card-h h2 { font-size: 14px; font-weight: 700; }
.card-h .sub { color: var(--dim); font-size: 12px; }
.card-h .spacer { flex: 1 1 auto; }
.card-b { padding: 16px; }
.card-b.flush { padding: 0; }

.grid { display: grid; gap: 14px; }
.g2 { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
.g3 { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
.g4 { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.spacer { flex: 1 1 auto; }

/* Kartu statistik */
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: var(--r); padding: 15px 16px; position: relative; overflow: hidden; }
.stat::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--accent); }
.stat.ok::after { background: var(--ok); }
.stat.warn::after { background: var(--warn); }
.stat.bad::after { background: var(--danger); }
.stat .v { font-size: 25px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat .l { color: var(--muted); font-size: 12px; font-weight: 600; margin-top: 3px; }
.stat .n { color: var(--dim); font-size: 11px; margin-top: 7px; }

/* Lencana */
.badge {
  display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px;
  border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .02em;
  border: 1px solid; white-space: nowrap;
}
.b-idle { background: rgba(97,116,143,.14); border-color: rgba(97,116,143,.4); color: #A8BCD6; }
.b-work { background: rgba(59,130,246,.16); border-color: rgba(59,130,246,.45); color: #9CC6FF; }
.b-wait { background: rgba(245,158,11,.14); border-color: rgba(245,158,11,.45); color: #FFD08A; }
.b-ok { background: rgba(34,197,94,.14); border-color: rgba(34,197,94,.42); color: #93E8B0; }
.b-fail { background: rgba(239,68,68,.15); border-color: rgba(239,68,68,.45); color: #FFA8A8; }
.b-cat { background: rgba(34,211,238,.12); border-color: rgba(34,211,238,.32); color: #8FE6F4; }
.b-muted { background: rgba(255,255,255,.04); border-color: var(--line); color: var(--muted); }

/* Tombol */
button.btn {
  font-family: inherit; font-size: 13px; font-weight: 650; cursor: pointer;
  padding: 8px 14px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--panel-2); color: var(--text); transition: all .13s;
  display: inline-flex; align-items: center; gap: 6px;
}
button.btn:hover:not(:disabled) { background: var(--panel-3); border-color: var(--accent); }
button.btn:disabled { opacity: .4; cursor: not-allowed; }
button.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 700; }
button.btn.primary:hover:not(:disabled) { background: #2E6FE0; }
button.btn.ok { background: rgba(34,197,94,.14); border-color: rgba(34,197,94,.45); color: #A5EDC0; }
button.btn.warn { background: rgba(245,158,11,.14); border-color: rgba(245,158,11,.45); color: #FFD79A; }
button.btn.bad { background: rgba(239,68,68,.14); border-color: rgba(239,68,68,.45); color: #FFB0B0; }
button.btn.sm { padding: 5px 10px; font-size: 12px; }

input, select, textarea {
  font-family: inherit; font-size: 13px; background: #0C1322; color: var(--text);
  border: 1px solid var(--line); border-radius: 8px; padding: 8px 11px; width: 100%;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
input[type=checkbox] { width: auto; }
label.f { display: block; font-size: 11px; color: var(--muted); font-weight: 700; margin-bottom: 5px; text-transform: uppercase; letter-spacing: .06em; }
label.f::after { content: ' *'; color: var(--danger); font-weight: 800; }
.hint { font-size: 11.5px; color: var(--dim); margin-top: 5px; line-height: 1.5; }

/* Tabel admin */
table.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
table.tbl th {
  text-align: left; color: var(--dim); font-size: 11px; text-transform: uppercase;
  letter-spacing: .06em; padding: 9px 12px; border-bottom: 1px solid var(--line);
  font-weight: 700; background: var(--side);
}
table.tbl td { padding: 10px 12px; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
table.tbl tbody tr:hover { background: rgba(255,255,255,.022); }
table.tbl td.num { text-align: right; font-variant-numeric: tabular-nums; }
table.tbl td.wrap { max-width: 320px; word-break: break-word; }

/* Papan pipeline */
.board { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; align-items: start; }
.col { background: var(--side); border: 1px solid var(--line-soft); border-radius: 9px; padding: 10px; min-height: 100px; }
.col h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 8px; display: flex; justify-content: space-between; }
.col h3 span { color: var(--dim); }
.item { background: var(--panel-2); border: 1px solid var(--line); border-left: 3px solid var(--line); border-radius: 7px; padding: 9px 10px; margin-bottom: 7px; cursor: pointer; transition: border-color .12s; }
.item:hover { border-color: var(--accent); }
.item .t { font-size: 12.5px; font-weight: 650; line-height: 1.35; margin-bottom: 5px; }
.item .m { font-size: 11px; color: var(--dim); display: flex; gap: 7px; flex-wrap: wrap; }
.item.blocked { border-left-color: var(--danger); }
.item.warn { border-left-color: var(--warn); }
.item.clean { border-left-color: var(--ok); }

/* ===================== KANTOR AGEN ===================== */

.office-wrap { position: relative; overflow: hidden; background: #070C15; min-height: 620px; max-height: 690px; }
.stage { position: relative; width: 1760px; height: 800px; margin: 0 auto; transform-origin: top center; transform: scale(.78); }
.iso-floor {
  position: absolute; left: 50%; top: 48%; width: 1700px; height: 1700px; margin: -850px 0 0 -850px;
  transform: scale(1, .55) rotate(45deg);
  background-image:
    linear-gradient(rgba(34,211,238,.085) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34,211,238,.085) 1px, transparent 1px);
  background-size: 92px 92px;
  border: 1px solid rgba(34,211,238,.12); border-radius: 36px;
  -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 26%, transparent 68%);
  mask-image: radial-gradient(circle at 50% 50%, #000 26%, transparent 68%);
  pointer-events: none;
}
.zone { position: absolute; width: 292px; transform: translate(-50%, -50%); }
.zone.dim { opacity: .48; }
.zone .plate {
  position: absolute; inset: -72px; transform: scale(1, .55) rotate(45deg);
  background: color-mix(in srgb, var(--zc, #3B82F6) 9%, transparent);
  border: 2px solid color-mix(in srgb, var(--zc, #3B82F6) 50%, transparent);
  border-radius: 32px; box-shadow: 0 0 48px color-mix(in srgb, var(--zc, #3B82F6) 20%, transparent);
}
.room {
  position: relative; z-index: 1; background: linear-gradient(165deg, #16202F, #0D1522);
  border: 1px solid var(--line); border-radius: 11px; padding: 9px 11px 11px;
  border-top: 3px solid var(--zc, var(--accent)); box-shadow: 0 14px 30px rgba(0,0,0,.5);
}
.room .zh { display: flex; align-items: center; gap: 7px; }
.room .zn {
  width: 18px; height: 18px; flex: 0 0 auto; border-radius: 5px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--zc, #3B82F6) 24%, transparent);
  color: var(--zc, var(--accent-2)); font-size: 10px; font-weight: 800;
}
.room .zt { font-size: 10.5px; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; color: var(--zc, var(--accent-2)); }
.room .zs { font-size: 10px; color: var(--dim); margin: 3px 0 8px 25px; }
.agents { display: flex; gap: 6px; flex-wrap: wrap; }
.agent { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 58px; cursor: pointer; }
.agent .av {
  width: 34px; height: 34px; border-radius: 50%; position: relative; display: grid; place-items: center;
  font-weight: 800; font-size: 12px; color: #05101C;
  background: linear-gradient(145deg, #6B8DBB, #47617F); border: 2px solid transparent; transition: transform .15s;
}
.agent:hover .av { transform: translateY(-2px) scale(1.07); }
.agent .nm { font-size: 8.5px; color: var(--muted); line-height: 1.15; font-weight: 650; text-align: center; }
.agent.sw .av { background: linear-gradient(145deg, var(--accent-2), var(--accent)); border-color: rgba(34,211,238,.65); }
.agent.sd .av { background: linear-gradient(145deg, #4ADE80, #16A34A); border-color: rgba(34,197,94,.6); }
.agent.sf .av { background: linear-gradient(145deg, #FB7185, #E11D48); border-color: rgba(239,68,68,.65); }
.agent.sa .av { background: linear-gradient(145deg, #FBBF24, #D97706); border-color: rgba(245,158,11,.7); }
.agent .fl { font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 4px; }
.agent .fl.need { background: rgba(245,158,11,.2); color: #FFD79A; border: 1px solid rgba(245,158,11,.45); }
.agent .fl.bad { background: rgba(239,68,68,.2); color: #FFA8A8; border: 1px solid rgba(239,68,68,.45); }

.flow { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; padding: 14px 16px; border-top: 1px solid var(--line-soft); }
.fnode { flex: 1 1 122px; min-width: 118px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; border-top: 3px solid var(--zc, var(--line)); }
.fnode.run { border-color: var(--accent-2); box-shadow: 0 0 0 3px rgba(34,211,238,.13); }
.fnode .fn { font-size: 10.5px; font-weight: 750; letter-spacing: .03em; text-transform: uppercase; color: var(--zc, var(--accent-2)); }
.fnode .fd { font-size: 10px; color: var(--muted); line-height: 1.32; margin-top: 2px; }
.fnode .fs { margin-top: 6px; }

.legend { display: flex; gap: 14px; flex-wrap: wrap; padding: 12px 16px 0; font-size: 11.5px; color: var(--muted); }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }

/* ===================== LACI DETAIL ===================== */

.backdrop { position: fixed; inset: 0; background: rgba(3,6,12,.7); z-index: 60; display: none; }
.backdrop.on { display: block; }
.drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(920px, 96vw); z-index: 61;
  background: var(--side); border-left: 1px solid var(--line);
  transform: translateX(100%); transition: transform .2s ease; overflow-y: auto;
}
.drawer.on { transform: translateX(0); }
.drawer-i { padding: 20px 22px 60px; }
.drawer .x {
  position: absolute; top: 12px; right: 14px; width: 30px; height: 30px; border-radius: 7px;
  background: var(--panel-2); border: 1px solid var(--line); color: var(--muted); cursor: pointer; font-size: 16px;
}
.sec { margin-top: 20px; }
.sec > h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700; margin-bottom: 9px; padding-bottom: 6px; border-bottom: 1px solid var(--line-soft); }

.strip { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px; }
.thumb { flex: 0 0 auto; width: 204px; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: #08111F; position: relative; }
.thumb iframe { width: 1080px; height: 1350px; border: 0; transform: scale(.1888); transform-origin: top left; pointer-events: none; display: block; }
.thumb .hold { width: 204px; height: 255px; }
.thumb .cap { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(5,9,16,.92); padding: 4px 7px; font-size: 10.5px; color: var(--muted); display: flex; justify-content: space-between; }

.finding { border-left: 3px solid var(--warn); background: rgba(245,158,11,.055); border-radius: 0 8px 8px 0; padding: 10px 12px; margin-bottom: 8px; }
.finding.block { border-left-color: var(--danger); background: rgba(239,68,68,.06); }
.finding .fh { font-size: 12.5px; font-weight: 700; display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.finding .fd { font-size: 12px; color: var(--muted); margin-top: 5px; line-height: 1.5; }
.finding .fd b { color: var(--text); font-weight: 600; }

pre.mono {
  background: #080D18; border: 1px solid var(--line-soft); border-radius: 8px;
  padding: 11px 13px; font-size: 12px; color: #C6D6EC; overflow-x: auto;
  white-space: pre-wrap; font-family: 'Cascadia Mono', Consolas, monospace; line-height: 1.55;
}

.empty { color: var(--dim); font-size: 13px; padding: 20px; text-align: center; border: 1px dashed var(--line); border-radius: 9px; }

/* ===================== POPUP KEMAJUAN ===================== */

.loading { position: fixed; inset: 0; z-index: 90; display: none; place-items: center; background: rgba(3,6,12,.72); }
.loading.on { display: grid; }
.loading .box { background: var(--panel); border: 1px solid var(--line); border-radius: 13px; padding: 26px 34px; text-align: center; min-width: 270px; box-shadow: var(--shadow); }
.spin { width: 38px; height: 38px; margin: 0 auto 14px; border-radius: 50%; border: 3px solid rgba(59,130,246,.2); border-top-color: var(--accent-2); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading .msg { font-size: 13.5px; font-weight: 650; }
.loading .sub { font-size: 11.5px; color: var(--dim); margin-top: 5px; line-height: 1.5; max-width: 320px; }

button.btn.loading-btn { pointer-events: none; opacity: .75; }
button.btn.loading-btn::after {
  content: ''; width: 11px; height: 11px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
  animation: spin .7s linear infinite; display: inline-block; margin-left: 4px;
}

.toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%) translateY(80px);
  background: var(--panel-3); border: 1px solid var(--line); border-left: 3px solid var(--accent-2);
  border-radius: 9px; padding: 12px 18px; font-size: 13px; z-index: 100;
  box-shadow: var(--shadow); opacity: 0; transition: all .25s; max-width: 540px;
}
.toast.on { transform: translateX(-50%) translateY(0); opacity: 1; }
.toast.ok { border-left-color: var(--ok); }
.toast.bad { border-left-color: var(--danger); }
.toast.warn { border-left-color: var(--warn); }

.similar { border: 1px solid rgba(245,158,11,.4); background: rgba(245,158,11,.07); border-radius: 9px; padding: 11px 13px; margin-top: 9px; }
.similar.dup { border-color: rgba(239,68,68,.45); background: rgba(239,68,68,.07); }

.uploads { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 9px; }
.up { width: 84px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #0A101C; position: relative; }
.up img { width: 100%; height: 62px; object-fit: cover; display: block; }
.up .un { font-size: 9.5px; color: var(--dim); padding: 3px 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up .del { position: absolute; top: 3px; right: 3px; background: rgba(239,68,68,.85); color: #fff; border: 0; width: 17px; height: 17px; border-radius: 4px; cursor: pointer; font-size: 11px; line-height: 1; }

.plan-row { display: flex; gap: 10px; align-items: flex-start; padding: 11px 0; border-bottom: 1px solid var(--line-soft); }
.plan-date { flex: 0 0 92px; }
.plan-date .d { font-size: 12.5px; font-weight: 700; }
.plan-date .w { font-size: 11px; color: var(--dim); }
.plan-body { flex: 1 1 auto; min-width: 0; }
.plan-body .tp { font-size: 13px; font-weight: 650; margin-bottom: 3px; }
.plan-body .rz { font-size: 11.5px; color: var(--muted); line-height: 1.45; }

.logo-prev { background: #0A101C; border: 1px solid var(--line); border-radius: 8px; padding: 10px; display: grid; place-items: center; min-height: 66px; color: var(--dim); font-size: 12px; }
.logo-prev img { max-height: 52px; max-width: 100%; }

@media (max-width: 900px) {
  .side { width: 60px; flex-basis: 60px; }
  .side-brand h1, .side-brand small, .side-nav .group, .side-nav button .tx, .side-foot { display: none; }
  .side-nav button { justify-content: center; }
  .main { margin-left: 60px; }
  .stage { transform: scale(.44); }
  .office-wrap { min-height: 420px; max-height: 440px; }
  .drawer { width: 100vw; }
}
`;

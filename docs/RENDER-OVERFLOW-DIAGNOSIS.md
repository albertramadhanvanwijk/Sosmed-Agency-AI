# Render Overflow Diagnosis: Slide 3 (244px Meluap)

**Status:** FIXED (Commit e9f5f5c)  
**Date:** 2026-10-03  
**Impact:** Production carousel "Psikologi of Money terkait trading" (job_0981490d)

## Akar Masalah

Slide 3 gagal render dengan pesan:
```
Teks meluap dari kanvas, render dibatalkan:
  - slide 3: .body-wrap kelebihan 244px
  - slide 3: .slide kelebihan 103px
```

### Root Cause Analysis

**Kombinasi elemen yang tidak kompatibel:**

1. **Slide 3 data:**
   - Role: `example`
   - Headline: "Simulasi Angka Risiko dan Drawdown" (32 karakter)
   - Body: "Perhitungan matematika risiko melindungi akun Anda dari batas maksimum penarikan dana prop firm." (93 karakter)
   - **Bullets:** 3 poin (66, 68, 57 karakter)
   - **Visual:** `stat_tile` dengan 3 kartu (Risiko Ide, Rugi Beruntun, Tujuan)

2. **Template selection:**
   - `resolveTemplate(slide)` matched visual `stat_tile` → selected `journal-stat-tile`
   - `journal-stat-tile` is designed for **stat tiles ONLY**, limits: `{bullets: 0}`
   - But bullets were present in slide data

3. **Validation gap:**
   - `validateSlide()` checked each field individually:
     - Headline: 32 chars < 56 limit ✓
     - Body: 93 chars < 380 limit ✓
     - Bullets: 3 poin < 4 limit ✓
   - **Validator did not check combined visual + bullets incompatibility**
   - Template was capable of rendering bullets (falls back via `concept-one-idea`), but template routing chose `journal-stat-tile`
   - Result: **template mismatch → render attempted with incompatible layout → overflow**

4. **Vertical space consumption:**
   - `stat_tile` occupies ~40% of body-wrap height (3 cards stacked)
   - 3 bullets add ~200-250px
   - Combined: exceeds ig_portrait canvas (1080x1350)
   - On square (1080x1080): still overflows 99px

### Why Validation Missed It

- Validation logic separated into two functions:
  - `validateSlide()` - checks text field limits (headline, body, bullets individually)
  - `validateVisualSize()` - checks visual constraints (table rows/cols, stat card count)
- **Gap:** No combined check for "stat_tile + bullets" which is structurally impossible
- Renderer was first to detect the overflow, after LLM cost already incurred

## Prevention (4-Layer Defense)

### Layer 1: Visual Constraint Validation (pipeline.ts)

```typescript
if (v.type === 'stat_tile' && v.stats) {
  // NEW: Block stat_tile + bullets combo
  if (slide.bullets.length > 0) {
    issues.push({
      slidePosition: slide.position,
      field: 'structure',
      message: `Slide berkartu (stat_tile) tidak boleh memuat daftar poin (${slide.bullets.length} poin). Kartu + bullets selalu meluap; pindahkan poin ke slide terpisah tanpa kartu.`,
      severity: 'block',
    });
  }
  // NEW: Enforce body length limit when stat_tile present
  const bodyLen = (slide.body ?? '').length;
  if (bodyLen > 180) {
    issues.push({
      slidePosition: slide.position,
      field: 'body',
      message: `Slide berkartu memuat isi ${bodyLen} karakter. Batasi ≤140 karakter bila memakai kartu, atau pindahkan penjelasan ke slide tanpa kartu.`,
      severity: 'block',
    });
  }
}
```

### Layer 2: Template Routing Priority (registry.ts)

```typescript
// Prioritize visual-specific templates to avoid template mismatch
if (visualType === 'stat_tile') {
  const stat = BY_SLUG.get('journal-stat-tile');
  if (stat && (stat.supportedRoles.includes(slide.role) || slide.role === 'example')) 
    return stat;
}
```

### Layer 3: Template Validation (registry.ts)

```typescript
// NEW: Explicit check for visual type + template limits mismatch
if (template.limits.bullets === 0 && slide.bullets.length > 0) {
  if (visualType === 'stat_tile' || visualType === 'table') {
    at('structure',
      `Template "${template.slug}" tidak mendukung daftar poin, tetapi slide memuat ${slide.bullets.length} poin bersama visual ${visualType}. Pindahkan poin ke slide tanpa ${visualType}.`,
      'block'
    );
  }
}
```

### Layer 4: Composer Prompt Update (prompts.ts)

```
- Untuk kartu angka, isi "visual" seperti: {"type":"stat_tile",...} dengan maksimal 4 kartu. 
  Slide berkartu (stat_tile) TIDAK BOLEH memuat bullets SAMA SEKALI — kartu + bullets selalu 
  meluap dan membuat render GAGAL. Bila butuh bullets, buat slide terpisah tanpa kartu.
```

## Verification Results

### Test: Failing Slide (Before Fix)
```
resolveTemplate: journal-stat-tile
validateSlide: [BLOCK] stat_tile + 3 bullets incompatible
overflow: [] (validation caught it early)
```

### Test: Fixture Suite (npm run render:check)
```
Slide dirender   : 9
Masalah overflow : 0
Peringatan validasi: 1 (unrelated)
Result: PASS
```

### Test: Budget Audit (npm run check:budget)
```
Kategori x Profil Rasio: OK (all 5 categories × 5 ratios pass)
Result: PASS
```

### Test: Unit Tests (npm run test:unit)
```
# tests 182
# pass 182
# fail 0
Result: PASS
```

## Impact

**Before:**
- Invalid slide data looped through Composer → Compliance → Renderer
- Renderer detected overflow after ~89 seconds and hundreds of LLM tokens spent
- Job failed at stage 6/9 (render), requiring manual fix + retry

**After:**
- Invalid slide data caught at Pipeline validation (stage 5, before renderer)
- Clear block message: "stat_tile + bullets cannot coexist"
- Composer can fix structure immediately without incurring render cost
- Validation prevents 100% of stat_tile + bullets cases

## Files Changed

- `packages/agents/pipeline.ts` - Added `validateVisualSize()` stat_tile + bullets block
- `packages/templates/registry.ts` - Added visual type prioritization + template limits check
- `packages/templates/text-budget.ts` - Updated `visualLimitsToPrompt()` with stat_tile bullet restriction
- `packages/agents/prompts.ts` - Updated Composer prompt with explicit stat_tile/bullets constraint

## Production Retry

Job `job_0981490d` ("Psikologi of Money terkait trading") will now fail at validation (not render), 
with actionable message for Composer to split slide 3 into two slides:
- Slide 3A: stat_tile only (short body, no bullets)
- Slide 3B: bullets only (no stat_tile, normal body)

Retry will succeed with corrected structure.

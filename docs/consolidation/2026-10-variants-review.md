# Independent review of VARIANTS.md (question variants design)

19 Oct 2026. Reviewer had not seen the report being written. Read-only: no repository was changed. The design is reviewed **as amended by AC's binding decisions** at the end of VARIANTS.md:
1. `required` forced as the default, 25 variants per question;
2. the Python/SymPy subset plus STACK `rand*` aliases;
3. an approval is voided only by changed values or keys;
4. the checklist bot from day 1, plus CODEOWNERS;
5. public previews allowed;
6. Moodle seeds re-approved;
7. old syntax broken, with no alias or converter;
8. `variables`, `teacher` and `variant{n,id,hash}`;
9. restore of the exact variant by id and hash;
10. a "New variant" button with no repeats, announced and saved. Those decisions are not re-argued. Where one of them makes something harder or riskier, that is flagged.

Evidence produced for this review is in `scratchpad/rv/`:
- `scan_opts.py`: option-parser compatibility across every math-exercise block in five repos.
- `t/probe_vars.py`: probes of the prototype evaluator.
- `t/hash_blind.py`: edits that keep the content hash.
- `t/hashes.py` plus `h_*.json`: content hashes under SymPy 1.12, 1.13.3 and 1.14.0.

Verdict. The audit part (§1) is accurate and well evidenced, with two exceptions: the page-size numbers and one overstated reproduction. Option B is a sound choice. As amended, though, the design has several gaps in its core mechanisms that must be closed before V1 starts:
- what the hash covers;
- which identity the student side keys on;
- the shape of `response["teacher"]`;
- how the bot behaves under real ticking.

It is also larger than one maintainer needs for v1. §4 lists what can be deferred.

---

## 1. Verification of factual claims

| Claim | Result |
|---|---|
| `variants.py` line refs (11-71, 75-85, 87-171, 108-117, 124-151, 127-129, 173-193) | correct at 8ab1b25 |
| `variants.lua:24-33`, `python3` hard-coded at `:27`; `math-exercise.lua:187, 745-758, 845-855, 995` | correct |
| `math-exercise.js:1314-1318, 1342-1350, 1356-1390, 1437-1482, 1534, 1771-1791` | correct |
| Fingerprint covers the whole definition, so a caption edit stops the build without naming file or label (R7) | reproduced (`scripts/repro.py`): `math-exercise variants: Reviewed definition changed; …` |
| R1–R5 templating bugs (`0.30000000000000004`, `y=1x+-3`, `1.23e+04`, `-0.00`, `$e^{{x}^2}$` error) | all reproduced |
| R9 `-0.{{b}}` fixture tests the wrong thing | reproduced with b = 10, **but the real example has b ∈ {1, 4}** (`_includes/variants/perpendicular.qmd:10-12`). It is a latent trap, not a live wrong test. Reword |
| "Authored variant tests never run in a course build or CI" | correct for ctm-demo: `quarto.yml:40-45` plus `check-stack-variants.py:28` only assert that tests exist. math-exercise's own CI does run its 5 examples' fixtures (`test.yml:39`, `variants.test.mjs:47-53`), which the report says |
| 720 fixtures natively, 0 failures, about 3 s | reproduced: 720/0, 5.5 s wall time including bootstrap |
| `#| lang:` swallowed by both parsers | correct (`variants.py:178-181`, `math-exercise.lua:187` treat any `#|` line as an option). G5 is decided but **not implemented**, so this is a precondition for G5 rather than a bug users hit today. Reword V-07's third bullet |
| Later `#|` lines can become body separators safely | **verified**: 0 math-exercise blocks in ingmat3a (108), ctm-demo (172), math-exercise (125) or the umbrella (22) have a `#|` line after body text |
| Prototype regenerates all 325 with identical parameter sets and equal keys | reproduced (`proto/compare.py`, 4.8 s) |
| Scenario table §3.6c | reproduced (`proto/scenarios.py`) |
| **Page size: "1.66 MB of 2.30 MB (72 %)", "page shrinks to 0.85–1.1 MB since 0.64 MB is not variant data"** | **wrong.** `measure.py` measures the decoded JSON. The attributes as served (with `&quot;` escaping) are **2,069,423 bytes = 90 %** of the page. Without them the page is **226,610 bytes**, so the post-migration page is about 0.6 MB, not 0.85–1.1 MB. Over the wire (gzip -9) the page is **152 KB today vs 75 KB without variants**. The leak of solutions, tests and templates is real, but the size argument for "major" is weaker than stated. Fix the numbers in §0, V-06 and §3.7 step 5 |
| stack-sympy refs (`stack-sympy.lua:104-118`, `importer.py:239`, seeds via `random.Random`) | correct. Note: stack-sympy blocks are identified by `{#id}` today, not `#| label:`; the report's STACK example silently introduces `#| label:` |
| ingmat3a has 7 pools | correct (`m1_2_exercises.md` 3, `m1_3.md` 4) |
| ctm-demo `page.js` is 76 lines of glue | correct; but see S7 for what it does that the migration drops |

---

## 2. Blocking (fix in the design before V1)

**B1. The content hash lets a wrong question through with approvals intact and CI green.** Decision 3 is "voided only by changed generated values or answer keys". The prototype implements this as the *set* of resolved placeholder values plus the keys (`proto/manifest.py:21-27`). Edits that change what students are asked therefore keep every approval. Verified with `rv/t/hash_blind.py` on the converted tangent exercise (18 approved):

| Edit | Result |
|---|---|
| A: question shows `\dfrac{@x - p2@}{@x - p1@}` (placeholders swapped), keys unchanged | 18 deployable, nothing to review |
| B: point changed in prose | 18 deployable |
| C: `mode: equivalent` → `mode: numeric` + `tolerance: 50%` | 18 deployable |

In case A every student gets a function whose answer key is wrong. The automatic teacher-answer test cannot catch it, because the key grades itself correct. This contradicts the report's "the bug cannot reach students".

This can be fixed within decision 3, without re-arguing it:
- hash the **ordered** sequence of placeholder values per text, or better the resolved **math segments** (`$…$`, `$$…$$`, answer markers), not a set;
- hash the **grading options** that act on the keys: `mode`, `tolerance`, `decplaces`, `sigfigs`, `form`, `reject`, `vars`, `partial-credit`, and the checker source hash.

Prose typos and translations (new prose, same math) still keep approvals. B (a meaning change in prose) stays the source diff's job, and the docs must say so explicitly. If AC regards grading options as outside "answer keys", ask (see §5).

**B2. Decisions 3 and 9 conflict unless restore resolves through the manifest.** Decision 3 keeps approvals across variable renames through the "moved" class. Decision 9 restores a saved variant "by id and hash". But a rename (`p1` → `a`) changes every id (`p1=2 …` → `a=2 …`). A literal id lookup therefore reports every saved variant as "no longer deployed", although each one is still deployed with identical content. The same happens to:
- rendezvous hashing over `(learner seed, page, label, id)` (§3.6i): every learner is reassigned on a rename;
- the "seen" list of decision 10.

Fix, within decision 9: the record stores `{n, id, hash}`, and restore looks the variant up **by hash among the deployed variants, then by `n`, then by id**. That is exactly the manifest's current/moved rule. Rendezvous and the no-repeat cycle should key on `n`, which the manifest keeps across moves.

**B3. `response["teacher"]` has different shapes in the two components, so checker files are not reusable.** §3.6a defines `teacher` "in the same shape as the learner's part: math-exercise per field; STACK by input name". math-exercise's learner part is positional (`response["expressions"][0]`, plus `response["inputs"][name]` for named matrices, `reference.md:83-85`). STACK's is named (`ans1`). A checker reading `response["teacher"][0]` fails in STACK, and `["ans1"]` fails in math-exercise. That breaks the owner constraint "same checker files reusable in both".

Step-2 §13 says the key names are decided *in this redesign*, and decision 8 fixes only the top-level keys, so this decision is still missing. Proposal: both components expose answers and teacher answers as a **mapping by field name** (math-exercise: `field-names:`, or a default `ans1…ansN`), keeping `expressions` as the positional legacy view in math-exercise.

Also specify how STACK's non-SymPy values (the port's collection wrappers, strings, equations) appear in `response["variables"]`.

---

## 3. Should-fix

**S1. Prototype evaluator: "no eval" is false, and there are no resource bounds.** `rv/t/probe_vars.py`:
- `a = subs("__import__('os').system('echo PWNED')", x, 1)` and `round("…", 2)` **execute shell commands**. String literals reach `sp.sympify` (`variables.py:40, 72`), which evaluates them.
- `a = 10^10^10`, `factor(x^200000 - 1)` and `shuffle([1..11])` each **hang** (killed at 8 s). `domain()` materialises all permutations before the 20,000 limit applies.

Today's `variants.py` has the guards the prototype dropped: exponent ≤ 100, ≤ 200 AST nodes, |result| ≤ 1e100.

The trust model is fine: variables are author code, like `#| checker:`, which `question-tests.py` already executes at build. But the design should:
- state that trust model;
- never pass strings to `sympify`;
- bound enumeration before materialising;
- run generation under a per-exercise time budget, so that `quarto preview` and the local helper cannot hang.

The report's "20,000 then sampled deterministically" (§3.6e) is not prototyped (the prototype raises) and needs a rule that is stable when the space grows.

**S2. `python -m ctm_checkers.variants build` contradicts step-2 §13** ("Build-time tests keep calling the script, never `python -m`; a page-folder module could shadow the standard library"). Use a script entry or `-P`/`-I`-safe launching, consistent with `question-tests.py`.

**S3. Where the tooling lives vs the browser wheel.**
- Putting `ctm_checkers.variants` (manifest, proposals, CLI, an `http.server` helper) in ctm-checkers puts authoring tooling into the wheel that is base64-embedded in **every** math-exercise page (step-2 §3.3). It also strains step-2 §1.2 "No UI in the library".
- Keep only the per-variant runtime the browser needs (rebuilding `variables` from `srepr`) in the shipped wheel. Exclude `variants.tooling` from the browser payload, or ship it as a separate dev-only module.
- The version in the planned error message ("math-exercise 0.11 replaced …") collides with step 2's math-exercise 0.11.0 ("nothing changes for authors"). It should be 0.12.

**S4. `required` as the forced default (decision 1) makes first authoring harder.** As specified, an exercise with no approved variants **stops the build**. So the first `quarto preview` of a new or edited exercise fails before the author has seen it. And any key fix voids approvals, which stops every local preview until re-approval. Specify a non-leaking behaviour for non-publishing renders: render a card "no approved variants — review" with a build warning, while CI and publishing still fail. Alternatively, have the VS Code "Preview" task use the review profile. Decide which.

**S5. The checklist bot (decision 4) needs concurrency and idempotency.**
- Each checkbox tick is a separate `issue_comment: edited` event. Ticking 20 boxes means 20 runs racing to commit to the PR branch (non-fast-forward failures, lost decisions).
- Required: `concurrency: {group: variants-decide-<PR>, cancel-in-progress: false}`; each run recomputes from the comment's *full current state* idempotently; one "approve all that pass" line.
- Never interpolate `github.event.comment.body` into `run:` (script injection). Exit early for issues, forks and non-bot comments.
- The sticky comment that the preview job rewrites on each push must carry ticks over, or drop decided lines.
- GitHub's 65,536-character comment limit: about 200 lines today is fine, but split for larger courses.
- Verify on a real repository that a `workflow_dispatch` run's `check` satisfies the branch-protection required check on the PR head. It is plausible but untested.

**S6. CODEOWNERS with "Require review from Code Owners" deadlocks a one-person team.** GitHub forbids approving your own PR. When AC opens the PR and ticks, he cannot provide the code-owner review; only an admin bypass would work. The course template should ship CODEOWNERS as advisory, or document that the required-review setting needs a second teacher.

**S7. Deleting ctm-demo's `page.js` drops behaviour the migration plan does not replace** (`assets/stack/page.js`):
- iframe `title`s for the four boards (accessibility, `:65`);
- re-send plus `layout` on `shown.bs.tab` and on opening the callout (JSXGraph in hidden tabs, `:64, 73`);
- clearing the **separate** `.ai-feedback` explanation activity's text and output when the variant changes (`:36-56`): a stale explanation would otherwise be sent with the new variant's question;
- MathJax typesetting of moved solutions.

The `#| boards:` protocol and the `-question` id cover only part of this. Add these to V2/V4 or keep a reduced `page.js`.

**S8. Pools: a behaviour change for ingmat3a that needs AC's approval.** Moving pools onto `variants.js` changes selection from "random per tab and reload" to "the same task per learner (rendezvous)". A student reloading for a new practice task gets the same one. Under the no-BC-without-approval rule, either keep pools random by default or ask AC. Also compute the pool `id` (task-text hash) in Lua (`pandoc.sha1`), so that pool pages keep needing no Python at build.

**S9. YAML options for all blocks would break existing exercises.** §3.6a rule 1 ("options are the leading `#|` lines only (YAML)") together with V-07 reads as one YAML parser for every exercise. `rv/scan_opts.py` finds blocks that YAML rejects:
- ctm-demo `_includes/physics/prove1-2026.md:29` and `prove2-2024.md:93` (`field-labels: |v(1)|, |r(1)|`);
- math-exercise `examples.qmd:814-875`, five blocks (`caption: form: factored`).

`initial-values: ["40"]` changes type in three places. ingmat3a's 108 blocks are clean. State that the Lua line parser stays for all blocks and that YAML applies only to the structured keys (`tests`), or list these migrations.

**S10. STACK classification order.** `classify` (`manifest.py:80-88`) treats "same id, different hash" as **changed** before looking for the hash elsewhere. For STACK, ids are seeds. Adding a `rand` call to the XML remaps every seed, so all approvals become "changed", although the same content exists under other seeds. Match on hash first for STACK, or on exact `(id, hash)` first and then on hash.

**S11. `rand` aliases (decision 2) clash with the "whole right-hand side" rule.**
- STACK's commonest idiom is `a : rand(5)+2`. The rule makes it an error, and `rand(5)` means 0…4, while `pick(lo, hi)` is inclusive.
- Specify exact STACK semantics for each alias (`rand(n)`, `rand(list)`, `rand_with_step`, `rand_with_prohib`, `rand_selection`; floats rejected).
- Either accept affine wrappers or give an error that suggests the `pick` form.

**S12. Determinism: verified stable for the demo, but pin the version anyway.** The 325 content hashes are identical under SymPy 1.12, 1.13.3 and 1.14.0 (`rv/h_*.json`). However:
- `simplify`, `factor` and `apart` are heuristic, and with `required` forced, a SymPy change in CI that alters output stops publishing;
- the build-time teacher-answer tests run native SymPy, while students are graded by Pyodide's 1.13.3 (ctm-demo `requirements.txt` says `sympy>=1.13`).

Course templates should pin `sympy` to the Pyodide version, CI should report the version in the job summary, and the cache key must include the SymPy version, not only the ctm-checkers version (§3.6e).

**S13. "Variant 7 of 25" (decision 10) is ambiguous because `n` has gaps.** `n` is never reused. After rejections (which decision 1's 25-per-question default makes routine), the deployed numbers are things like {1, 2, 4, …, 31}, so "Variant 31 of 25" appears.

The alternative is to show the *position* among the deployed variants. That number shifts whenever an approval is added or withdrawn, so "I had variant 7" stops meaning anything to the teacher, which defeats V-01.

Recommend showing `n` ("Variant 31", plus "25 in use" if wanted) and putting the question to AC (§6).

**S14. Storage design for decisions 9 and 10 (P17).**
- **The learner seed in `localStorage` ignores the P17 opt-in.** §3.6i keeps it in `localStorage` even when saving is off. Use the same storage rule as the variant choice, and document that "per learner" means per browser profile: shared lab machines give every student the same variants.
- **The record must hold more than the variant.** Decision 10's no-repeat cycle must survive reloads, so the record needs `{n, id, hash}` of the current variant **and the list of `n` already seen**.
  - When the deployed set changes, the unseen ones are the deployed `n`s not in that list.
  - A withdrawn `n` simply drops out.
  - Do not store a position in the ranking: that breaks when the set changes.
- **One record per exercise.** "New variant" (after the confirmation) replaces the inputs. Say explicitly that the old variant's answers are not kept, or keep them per `n` (more storage, more UI). Decision 9's "old answers stay readable" applies only to the withdrawn-variant path.
- **The key `ctm|1|<site base>|<page>|<label>` vs P21 profiles.**
  - One build per language with different `output-dir`s or base paths gives the same exercise two keys. Switching language then loses the saved variant, contrary to P21 ("keyed by label, not language").
  - Use a language-independent site key, configurable as `ctm-assessment: storage-key:`.
  - The variant `hash` must likewise be computed from the full source (all languages) in every profile build. The design implies this but does not say it.
  - Moving an exercise to another page orphans its records. Document it, or key by label plus site only, with labels unique per site.
- **Restore vs the hash rule.**
  - With decision 3's hash as prototyped (B1), a swapped-placeholder edit keeps the hash. Restore then silently refills old answers into a question that now asks something else. B1's fix removes this too.
  - P17's generic "source changed → offer, don't fill" rule must be **replaced** by the variant hash for variant exercises. Otherwise every prose typo downgrades "restore exact" to "offer", contradicting decision 9.
- **The "no longer deployed" path (decision 9).** The one-line message, the read-only old answers and the "new variant" offer need catalogue strings (en/de/nb), an `aria-live` announcement, and a non-input rendering of the old answers, so they cannot be re-checked against the wrong key.
- **Pools.** Decisions 9 and 10 read as applying to every exercise with variants. If pools join the shared model, ingmat3a's pools gain saving, the button and stable selection: a visible change that needs AC's approval (S8).

**S15. Default 25 per question (decision 1) and the approval workload.**
- ctm-demo goes from 325 deployed variants to about 24 + 25 + 25 + 25 = 99. That requires about 99 approvals, plus re-approval after any key fix.
- That makes "Approve all new that pass" and the bot's single "approve all" line essential rather than optional. Both need the confirmation and undo from §4.
- ctm-demo's README ("all variants") must be updated.
- Define what happens when fewer than 25 are approved: deploy what is approved with a CI warning (suggested), or fail.
- Also define the case when a proposal fails its tests and the candidate space is exhausted.

---

## 4. Minor

- The `proto/manifest.py` docstring still describes `<file>.variants.yml` beside the source, while the report specifies `_variants/<label>.yml`. Align them.
- The angle note contains LaTeX (`$v={\frac{2 \pi}{3}}$`) that lands in the YAML manifest and the bot checklist. Recommend `{#…#}` in notes.
- `raw()` uses `sstr`. Answer-marker values for matrices (`Matrix([[…]])`), `Abs`, `I` and `oo` do not match what students type in math-exercise. Map per type and test.
- `dispdp`/`dispsf` decimal separator on `nb` pages: state the rule (point always, as STACK's default and ctm-demo's conventions), given P21.3.
- **Approval page accessibility.**
  - "Approve all new that pass" needs a confirmation and an undo.
  - "Saved" should go through an `aria-live` status.
  - Use a native `<dialog>` for "Reject…" reasons.
  - Pass/fail glyphs need text.
  - Paginate or collapse per exercise: hundreds of MathJax cards plus Pyodide on one page are slow.
- "Open in GitHub editor" prefill is only possible for new files. A 71-entry manifest is about 25 KB, which is about 35 KB URL-encoded and may exceed URL limits. Test it, or offer only Copy.
- "Copy file" emits the whole file from the preview's snapshot. A second paste based on an older preview silently overwrites newer decisions. Include the base manifest hash in the emitted file and let `check` reject a mismatch.
- Public previews (decision 5): delete `previews/<branch>` when the PR closes, and keep it on publish (already noted). Previews sit on the students' domain; that is acceptable per the decision.
- STACK's `#| variants:` changes meaning from "number of seeds shown" to "wanted approved count". Say so in the stack-sympy migration note.
- `optional` mode (non-default) deploys undecided proposals, which have no `n`. Define what students see there.

---

## 5. Could-cut or defer (one maintainer, one demo course)

Keep for v1, because the requirements need them:
- the variables language and placeholders;
- the manifest with `n/id/hash/status`;
- current/changed/moved classification (decision 3 needs "moved");
- teacher-answer and authored tests at build and in CI;
- the review page with Copy file;
- the local helper (without file watching);
- the checklist bot (decision 4);
- stable selection by `n`;
- the checker contract.

Defer:
1. **Wrong-answer probes** (§3.6f item 2): heuristic and warning-only. STACK does not generate them. Ship teacher-answer plus authored tests first.
2. **Pools in the shared model** (§3.6k): this avoids S8's behaviour change and risk to ingmat3a. Only keep the `#| lang:`-safe parser.
3. **G3 `workflow_dispatch` form**: decision 4 does not ask for it.
4. **The helper's file watching and auto-rebuild**: a Rebuild button is enough.
5. **The build cache** in `.quarto/ctm-variants/`: cold generation of all of ctm-demo takes about 3.5 s. Add it when preview speed demands it, and then key it on the SymPy version (S12).
6. **`#| boards:` plus the jsxgraph helper**: keep a reduced ctm-demo `page.js` on the new `ctm:variant-change` event until a second course needs figures (it also covers S7).
7. **Byte-identical JS/Python YAML writers** (golden test): let `check` accept any valid manifest and normalise on the next tool write. Diff noise is a smaller cost than two writers.
8. **The STACK adapter (V5)** is already deferred to step 6. Keep it there, but settle B3's shapes now.
9. Already removed by decision 7: `migrate`, the one-release alias.

Option B vs A/C: B is right for "CAS-computed keys and simplified display", which A cannot give. The report's A is a strawman on one point: A plus the manifest would also give one approval model. The real choice was "numbers-only templates vs SymPy variables", which AC settled. With the deferrals above, B is roughly a V1 of 3 modules plus a page and a workflow, which is reasonable.

---

## 6. The questions to AC

The six questions were mostly the right ones. Q1 bundled two issues (mode, counts). Q3 was not fully neutral: it offered only "values and keys" vs "any change voids everything" and did not show the swap case (B1), so AC decided without that evidence. Show him B1's table and the fix. It stays within decision 3.

Missing decisions to put to AC:
1. **Answer and teacher shape across components** (B3): naming of fields in math-exercise and the mapping in both.
2. **Do grading options count as "answer keys"** for voiding approvals (B1-C)?
3. **Pools**: keep random per reload, or move to stable per learner (S8)?
4. **`required` with zero approved variants** in local, non-publishing renders: stop, or placeholder card (S4)?
5. **CODEOWNERS for a solo maintainer**: advisory, or required review (S6)?
6. **Which `rand` forms are accepted** (S11).
7. **Displayed number** (S13): the stable `n` (with gaps) or the position among the deployed variants (which shifts)?
8. **Storage key for bilingual profile builds** (S14): a language-independent site key? Keep answers per variant, or only the current one?
9. **Fewer than the wanted 25 approved** (S15): warning or failure?

---

## Addendum: decision 11 (overview like STACK's screens, one checklist line per variant)

Script: `rv/t/bot_size.py`. It builds the bot lines from the prototype for 25 variants of each of ctm-demo's 4 questions. Each line holds the number, the id, every key as `` $`…`$ `` maths, the verdict, a preview-card link and a hidden `<!-- hash -->`. Not tested on GitHub itself, because this session may not write to GitHub; the GitHub points below need a test PR.

**Size**
- Lines run 210–355 characters (values, with 8 keys, is the longest), about 265 on average. That is 5.2–8.6 KB per question at 25 variants.
- ctm-demo, 4 questions × 25: **26,440 characters**, so it fits one comment (limit 65,536).
- About 9 questions at 25 variants fill one comment. A 30-question course needs about **200 KB, or at least 4 comments**. That will happen at the first migration, and whenever all approvals become "changed" at once (a SymPy change under `required`).
- `<details>` folding hides text but does not reduce the character count.

**What to do at the limit**
- One sticky comment **per question**, found by a hidden `<!-- ctm-variants:<label> -->` marker. A question at 25 variants is at most about 9 KB, so it always fits.
- List only questions with undecided or changed variants. When a question becomes fully decided, collapse it to its summary line.
- Beyond about 30 open questions, post a summary comment that links to the review page instead of a checklist. GitHub also limits PR comments per minute, so post sequentially.

**Maths in task-list items**
- GitHub renders `$…$` in comments, list items included. Use the `` $`…`$ `` form: it protects `_`, `*` and `\\` from Markdown. This must be confirmed on a test PR, including inside `<details>`.
- About 200 formulas per comment render slowly. Showing the note instead of all keys keeps lines short.
- Keys of `mode: numeric` questions currently print as fractions (`\frac{99}{100}`, `-\frac{87}{100}`). Format them per mode: decimals with the key's precision, like `dispdp`.

**Reading ticks back reliably**
- **Every line carries a machine token,** `<!-- label n id hash -->`. HTML comments survive in the body and are invisible.
- **Parse only what the token says.** The bot parses only comments it authored, by author id and marker, and reads the token and checkbox state per line. It never relies on line position or the visible text.
- **A tick is an edit by a person.** Toggling a box edits the comment as that user and fires `issue_comment.edited`. When the bot rewrites the comment itself, the edit uses `GITHUB_TOKEN` and starts no run. So every run is human input, but people's ticks and the bot's rewrites can still overwrite each other.
- **Races (S5):**
  - the decide job runs per PR with `concurrency` and `cancel-in-progress: false`;
  - it handles the comment's *whole* current state idempotently, as a set of approve and unapprove tokens compared with the manifest;
  - after committing, it rewrites a line as "approved by @x" (no checkbox) instead of leaving a live box.
- **Ticks lost when the bot rewrites the comment.** The preview job rewrites comments after each push. It must first merge any ticks not yet recorded, or refuse to rewrite while a decide run is pending. Otherwise a tick made during the rewrite is lost.
- **Unticking and rejecting.** Define what unticking a recorded approval means (revoke, or ignore). A checkbox has no third state, so rejection stays a `/variants reject <label> <n> "reason"` command.
- **Stale or missing preview links.** The link to the card may 404 for a minute after the comment appears, until Pages has deployed. Post the comment after the deployment.
- **The page is the source.** The review page should have the same columns as a real `<table>`: row headers, an accessible name per checkbox, and MathJax with assistive MathML.

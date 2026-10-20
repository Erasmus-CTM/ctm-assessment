-- CTM Assessment: a course's Markdown files as ctm-libs' markdown-lint reads them (AGPL-3.0-or-later).
--
--   quarto pandoc lua tools/markdown-lines.lua CTM_LIBS_EXTENSION PROJECT < request
--
-- Reads the request as JSON, {"files": [FILE, ...], "langs": [TAG, ...]} (on
-- standard input: Quarto's Pandoc 3.6 crashes when `pandoc lua` gets more
-- than 82 arguments), and prints one JSON object:
--   files:     {FILE: {lines = [[text, raw] or false, ...], rawHTML = [[rule, line], ...]}}
--              for each FILE (relative to PROJECT): its lines, split as Python's
--              str.split("\n") splits the text (universal newlines), as
--              ctm.source.read() reads them, and the raw HTML ctm.ui.rawHTML()
--              names in them;
--   titles:    {kind: {lang: title}}: ctm.ui.defaultTitle() of every reveal kind
--              in every language of the ui catalogue;
--   languages: {TAG: lang}: ctm.locale.language("ui", TAG), the catalogue
--              language a page in TAG gets.
-- These are ctm-libs' own rules (docs/api.md, "Outside a render"), not
-- copies: tools/migrate-course-html.py runs this with the ctm-libs the
-- umbrella pins, and tests/test_migrate_course_html.py fails when its result
-- stops following a change of those rules.
local extension, root = arg[1], arg[2]
quarto = {json = pandoc.json}
local ctm = dofile(pandoc.path.join({extension, "lua", "ctm.lua"}))
local KINDS = {"reading-step", "hint", "solution", "details"}

if not (ctm.source and ctm.source.read and ctm.ui and ctm.ui.rawHTML and ctm.ui.defaultTitle) then
  io.stderr:write("ctm-libs " .. tostring(ctm.version) .. " (" .. extension .. ") has no ctm.source.read, "
    .. "ctm.ui.rawHTML and ctm.ui.defaultTitle: the converter needs a ctm-libs that has them "
    .. "(Erasmus-CTM/ctm-libs, after 0.9.0)\n")
  os.exit(3)
end

local function lines(path)
  local handle = io.open(path, "rb")
  if not handle then return nil end
  local text = handle:read("*a")
  handle:close()
  local found = {}
  for line in (text:gsub("\r\n?", "\n") .. "\n"):gmatch("([^\n]*)\n") do found[#found + 1] = line end
  return found
end

local request = pandoc.json.decode(io.read("a"), false)
local out = {files = {}, titles = {}, languages = {}}
for _, tag in ipairs(request.langs or {}) do out.languages[tag] = ctm.locale.language("ui", tag) end
for _, file in ipairs(request.files or {}) do
  local given = lines(pandoc.path.join({root, file}))
  if given then
    local read, flagged = {}, {}
    for number, line in ipairs(ctm.source.read(given)) do
      read[number] = line and {line.text, line.raw} or false
    end
    for _, hit in ipairs(ctm.ui.rawHTML(given)) do flagged[#flagged + 1] = {hit.rule, hit.line} end
    out.files[file] = {lines = read, rawHTML = flagged}
  end
end
for _, kind in ipairs(KINDS) do
  out.titles[kind] = {}
  for _, lang in ipairs(ctm.locale.supported("ui")) do out.titles[kind][lang] = ctm.ui.defaultTitle(kind, lang) end
end
io.write(pandoc.json.encode(out), "\n")

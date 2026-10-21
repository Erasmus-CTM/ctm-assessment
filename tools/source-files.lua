-- CTM Assessment: the files a page shows, as ctm-libs reads them (AGPL-3.0-or-later).
--
--   quarto pandoc lua tools/source-files.lua CTM_LIBS_EXTENSION PROJECT PAGE...
--   quarto pandoc lua tools/source-files.lua CTM_LIBS_EXTENSION PROJECT --include < requests
--
-- Prints "PAGE<TAB>FILE" for every file each PAGE shows: the page and the
-- files it includes, nested ones too, in order, FILE relative to PROJECT.
-- With --include, reads "FOLDER<TAB>LINE" requests, one per line, and prints
-- for each, in order, the file that LINE (an include shortcode) brings in on
-- a page in FOLDER, as ctm-libs gives its label (empty: none).
-- The rule is ctm-libs' own, ctm.source.files() (lua/source.lua, what its
-- markdown-lint reads), not a copy: this stub only gives that module the two
-- values of Quarto's page context it reads, the page's file and the project's
-- folder; for --include, the page is a line long and is served from memory
-- (io.open answers for it), so nothing is written into the project.
-- tools/migrate-course-html.py runs it with the ctm-libs that the umbrella
-- pins; tests/test_migrate_course_html.py fails if it stops working.
local extension, root = arg[1], arg[2]
local module = pandoc.path.join({extension, "lua", "source.lua"})

local function files(page)
  quarto = {doc = {input_file = page}, project = {directory = root}}
  return dofile(module)({}).files()
end

if arg[3] == "--include" then
  -- A name no file has (Windows forbids <>): only this page is served from memory.
  local name, realOpen = "<ctm include line>.md", io.open
  for request in io.lines() do
    local folder, line = request:gsub("\r$", ""):match("^(.-)\t(.*)$")
    io.open = function(path, mode)
      if pandoc.path.filename(path) == name then
        return {read = function() return line .. "\n" end, close = function() end}
      end
      return realOpen(path, mode)
    end
    local ok, found = pcall(files, pandoc.path.join({root, folder, name}))
    io.open = realOpen
    if not ok then error(found) end
    io.write(found[2] and found[2].label or "", "\n")
  end
else
  for k = 3, #arg do
    for _, file in ipairs(files(pandoc.path.join({root, arg[k]}))) do
      io.write(arg[k], "\t", file.label, "\n")
    end
  end
end

-- CTM Assessment: the files a page shows, as ctm-libs reads them (AGPL-3.0-or-later).
--
--   quarto pandoc lua tools/source-files.lua CTM_LIBS_EXTENSION PROJECT PAGE...
--
-- Prints "PAGE<TAB>FILE" for every file each PAGE shows: the page and the
-- files it includes, nested ones too, in order, FILE relative to PROJECT.
-- The rule is ctm-libs' own, ctm.source.files() (lua/source.lua, what its
-- markdown-lint reads), not a copy: this stub only gives that module the two
-- values of Quarto's page context it reads, the page's file and the project's
-- folder. tools/migrate-course-html.py runs it with the ctm-libs that the
-- umbrella pins; tests/test_migrate_course_html.py fails if it stops working.
local extension, root = arg[1], arg[2]
local module = pandoc.path.join({extension, "lua", "source.lua"})
for k = 3, #arg do
  quarto = {doc = {input_file = pandoc.path.join({root, arg[k]})}, project = {directory = root}}
  for _, file in ipairs(dofile(module)({}).files()) do
    io.write(arg[k], "\t", file.label, "\n")
  end
end

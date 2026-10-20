-- Test fixture: shows whether the page's metadata has the ctm-tab-ids flag
-- that tab-ids.lua sets (ctm-libs' markdown-lint reads it).
function Pandoc(doc)
  if doc.meta["ctm-tab-ids"] ~= nil then
    doc.blocks:insert(pandoc.RawBlock("html", '<p id="ctm-tab-ids-flag">' .. pandoc.utils.stringify(doc.meta["ctm-tab-ids"]) .. "</p>"))
  end
  return doc
end

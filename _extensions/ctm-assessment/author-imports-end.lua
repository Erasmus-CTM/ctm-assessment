-- All component handlers have registered their actual authored Python.
return {{Pandoc = function(doc)
  local collector = rawget(_G, "__ctmAuthorImports")
  return collector and collector.finish(doc) or doc
end}}

export function formatAsHyperlink(url, name) {
  return `=HYPERLINK("${url}", "${sheetsEscapeString(name)}")`
}

export function formatDate(dateStr) {
  return Math.round(
    (Date.parse(`${dateStr}UTC`) - Date.parse('1899-12-30UTC')) /
      (1000 * 60 * 60 * 24),
  )
}

function sheetsEscapeString(str) {
  return str.replace('"', '""')
}

export function mapFieldsToRow(fieldIndexMap, data) {
  const totalCols = Math.max(...Object.values(fieldIndexMap))

  const result = (new Array(totalCols - 1)).fill(undefined)

  Object.entries(data).forEach(([field, value]) => {
    if (!fieldIndexMap[field]) {
      throw new Error(`Unknown field "${field}"`)
    }

    result[fieldIndexMap[field] - 1] = value
  })

  return result
}

export function getColumn(num) {
  let col = ''

  for (let a = 1, b = 26; (num -= a) >= 0; a = b, b *= 26) {
    col = String.fromCharCode(Math.floor((num % b) / a) + 65) + col
  }

  return col
}

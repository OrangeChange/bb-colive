export function formatCurrency(price) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: price < 100 ? 1 : 0,
  }).format(price)
}

export function getTimeTextHourMin(date) {
  let hour = date.getHours()
  let min = `00${date.getMinutes()}`.slice(-2)
  return `${hour}:${min}`
}

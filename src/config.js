import transenv from 'transenv'
export default transenv()(({str, bool}) => {
  return {
    port: str('PORT'),
  }
})

import transenv from 'transenv'
export default transenv()(({str, bool}) => {
  return {
    port: str('PORT'),
    alza: {
      credentials: {
        userName: str('alza-username'),
        password: str('alza-password'),
      }
    }
  }
})

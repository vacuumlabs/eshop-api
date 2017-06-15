import {run} from 'yacol'
import {getInfo} from './src/alza'
import {connect, listen} from './src/slack'
import c from './src/config'

//run(getInfo, 'https://www.alza.sk/dji-phantom-4-advanced-d4844052.htm')

run(function* () {
  yield run(connect, c.slack.botToken)
})

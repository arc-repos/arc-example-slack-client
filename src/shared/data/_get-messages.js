var waterfall = require('run-waterfall')
var parallel = require('run-parallel')
var slack = require('slack')
var data = require('./_get-db')
var assert = require('@smallwins/validate/assert')

module.exports = function _getMessages(params, callback) {
  assert(params, {
    email: String,
  })
  waterfall([
    function getWorkspaces(callback) {
      data.accounts.query({
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': params.email
        }
      }, callback)
    },
    function getConversations(result, callback) {
      parallel(result.Items.map(account=> {
        return function _getConversations(callback) {
          parallel({
            conversations(callback) {
              slack.conversations.list({
                token: account.token,
                types: 'im,mpim',
              }, callback)
            },
            people(callback) {
              slack.users.list({
                token: account.token
              }, callback)
            }
          },
          function _list(err, result) {
            if (err) {
              callback(err)
            }
            else {
              var copy = Object.assign({}, account)
              copy.channels = result.conversations.channels
              copy.people = result.people.members
              callback(null, copy)
            }
          })
        }
      }), callback) 
    },
    function getHistory(result, callback) {
      parallel(result.map(account=> {
        return function _getHistory(callback) {
          //TODO get the group membership/history?
          parallel(account.channels.filter(c=> !c.is_group).map(channel=> {
            return function _getChannelHistory(callback) {
              slack.conversations.info({
                token: account.token,
                channel: channel.id,
              }, callback)       
            }
          }),
          function _done(err, infos) {
            if (err) {
              callback(err)
            }
            else {
              function mixin(channel) {
                if (channel.is_group) return channel
                var info = infos.find(i=> i.channel.id === channel.id)
                return info.channel
              }
              var copy = Object.assign({}, account)
              copy.channels = account.channels.map(mixin)
              callback(null, copy)
            }
          })

        }
      }), callback)
    }
  ], callback)
}


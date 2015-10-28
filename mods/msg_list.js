/* jslint node: true */
'use strict';

var MenuModule			= require('../core/menu_module.js').MenuModule;
var ViewController		= require('../core/view_controller.js').ViewController;
var messageArea			= require('../core/message_area.js');
var Message				= require('../core/message.js');

//var moment				= require('moment');
var async				= require('async');
var assert				= require('assert');
var _					= require('lodash');
var moment				= require('moment');

/*
	Available listFormat/focusListFormat members (VM1):

	msgNum			: Message number
	to				: To username/handle
	from			: From username/handle
	subj			: Subject
	ts				: Message mod timestamp (format with config.dateTimeFormat)
	newIndicator	: New mark/indicator (config.newIndicator)

	MCI codes:

	VM1			: Message list
	TL2			: Message area description
	TL4			: Message selected #
	TL5			: Total messages in area
*/

exports.getModule		= MessageListModule;

exports.moduleInfo = {
	name	: 'Message List',
	desc	: 'Module for listing/browsing available messages',
	author	: 'NuSkooler',
};

var MciCodesIds = {
	MsgList			: 1,
	MsgAreaDesc		: 2,
	
	MsgSelNum		: 4,
	MsgTotal		: 5,
};

function MessageListModule(options) {
	MenuModule.call(this, options);

	var self	= this;
	var config	= this.menuConfig.config;

	this.listType = config.listType || 'public';

	this.messageList = [];

	this.menuMethods = {
		selectMessage : function(formData, extraArgs) {
			if(1 === formData.submitId) {
				var modOpts = {
					name		: config.menuViewPost || 'messageAreaViewPost',//'messageAreaViewPost',	//	:TODO: should come from config!!!
					extraArgs 	: {
						messageAreaName		: self.messageAreaName,
						messageList			: self.messageList,
						messageIndex		: formData.value.message,
					}
				};

				self.client.gotoMenuModule(modOpts);
			}
		}
	};

	this.setViewText = function(id, text) {
		var v = self.viewControllers.allViews.getView(id);
		if(v) {
			v.setText(text);
		}
	};
}

require('util').inherits(MessageListModule, MenuModule);

MessageListModule.prototype.enter = function(client) {
	MessageListModule.super_.prototype.enter.call(this, client);

	if('private' === this.listType) {
		this.messageAreaName = Message.WellKnownAreaNames.Private;
	} else {
		this.messageAreaName = client.user.properties.message_area_name;
	}
};

MessageListModule.prototype.mciReady = function(mciData, cb) {
	var self	= this;
	var vc		= self.viewControllers.allViews = new ViewController( { client : self.client } );

	async.series(
		[
			function callParentMciReady(callback) {
				MessageListModule.super_.prototype.mciReady.call(self, mciData, callback);
			},
			function loadFromConfig(callback) {
				var loadOpts = {
					callingMenu		: self,
					mciMap			: mciData.menu
				};

				vc.loadFromMenuConfig(loadOpts, callback);
			},
			function fetchMessagesInArea(callback) {
				messageArea.getMessageListForArea( { client : self.client }, self.messageAreaName, function msgs(err, msgList) {
					if(msgList && 0 === msgList.length) {
						callback(new Error('No messages in area'));
					} else {
						self.messageList = msgList;
						callback(err);
					}
				});
			},
			function getLastReadMesageId(callback) {
				messageArea.getMessageAreaLastReadId(self.client.user.userId, self.messageAreaName, function lastRead(err, lastReadId) {
					self.lastReadId = lastReadId || 0;
					callback(null);	//	ignore any errors, e.g. missing value
				});
			},
			function populateList(callback) {
				var msgListView = vc.getView(MciCodesIds.MsgList);

				//	:TODO: fix default format
				var listFormat		= self.menuConfig.config.listFormat || '{msgNum} - {subj} - {to}';
				var focusListFormat = self.menuConfig.config.focusListFormat || listFormat;	//	:TODO: default change color here
				var dateTimeFormat	= self.menuConfig.config.dateTimeFormat || 'ddd MMM DDD';
				var newIndicator		= self.menuConfig.config.newIndicator || '*';

				var msgNum = 1;

				function getMsgFmtObj(mle) {
					return {
						msgNum			: msgNum++, 
						subj			: mle.subject,
						from			: mle.fromUserName,
						to				: mle.toUserName,
						ts				: moment(mle.modTimestamp).format(dateTimeFormat),
						newIndicator	: mle.messageId > self.lastReadId ? newIndicator : '',
					}
				}

				msgListView.setItems(_.map(self.messageList, function formatMsgListEntry(mle) {
					return listFormat.format(getMsgFmtObj(mle));
				}));

				msgNum = 1;
				msgListView.setFocusItems(_.map(self.messageList, function formatMsgListEntry(mle) {
					return focusListFormat.format(getMsgFmtObj(mle));
				}));

				msgListView.on('index update', function indexUpdated(idx) {
					self.setViewText(MciCodesIds.MsgSelNum, (idx + 1).toString());
				});

				msgListView.redraw();

				callback(null);
			},
			function populateOtherMciViews(callback) {

				self.setViewText(MciCodesIds.MsgAreaDesc, messageArea.getMessageAreaByName(self.messageAreaName).desc);
				self.setViewText(MciCodesIds.MsgSelNum, (vc.getView(MciCodesIds.MsgList).getData() + 1).toString());
				self.setViewText(MciCodesIds.MsgTotal, self.messageList.length.toString());

				callback(null);
			},
		],
		function complete(err) {
			if(err) {
				self.client.log.error( { error : err.toString() }, 'Error loading message list');
			}
			cb(err);
		}
	);
};


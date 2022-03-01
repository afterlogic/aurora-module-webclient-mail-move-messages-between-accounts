'use strict';

const
	ko = require('knockout'),

	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),

	App = require('%PathToCoreWebclientModule%/js/App.js'),
	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	Storage = require('%PathToCoreWebclientModule%/js/Storage.js'),

	Settings = require('modules/%ModuleName%/js/Settings.js')
;

function initMoveToFolderButton(ModulesManager, view)
{
	const
		MailCache = ModulesManager.run('MailWebclient', 'getMailCache'),

		moveHistoryData = ko.observableArray([])
	;

	if (!MailCache) {
		throw 'There is no MailCache';
	}

	view.moveToFolderTemplate = '%ModuleName%_MoveButtonView';
	view.openMoveToFolderPopupCommand = Utils.createCommand(view, function () {
		const MoveToFolderPopup = require('modules/%ModuleName%/js/popups/MoveToFolderPopup.js');
		Popups.showPopup(MoveToFolderPopup, [view.oMessageList.checkedOrSelectedUids(), moveHistoryData]);
	}, view.isEnableGroupOperations);

	moveHistoryData(Storage.getData('moveMessagesHistoryData') || []);
	view.moveHistoryData = ko.computed(function () {
		const
			currentAccountId = MailCache.currentAccountId(),
			currentFolderFullname = MailCache.getCurrentFolderFullname()
		;
		return moveHistoryData().filter(data => {
			const
				isCurrentAccount = data.accountId === currentAccountId,
				isCurrentFolder = isCurrentAccount && data.folder === currentFolderFullname
			;
			return !isCurrentFolder;
		}).slice(0, Settings.NumberOfRecordsInHistory);
	}, view);
	view.openMoveHistoryCommand = Utils.createCommand(view,
		() => {}, () => view.moveHistoryData().length > 0);
	view.openMoveToFolderPopup = function (accountId, folder) {
		const MoveToFolderPopup = require('modules/%ModuleName%/js/popups/MoveToFolderPopup.js');
		Popups.showPopup(MoveToFolderPopup, [view.oMessageList.checkedOrSelectedUids(), moveHistoryData, accountId, folder]);
	};
}

module.exports = function (appData) {
	if (App.isUserNormalOrTenant()) {
		Settings.init(appData);

		return {
			start: (ModulesManager) => {
				if (ModulesManager.isModuleIncluded('MailWebclient')) {
					App.subscribeEvent('MailWebclient::ConstructView::after', function (params) {
						if (params.Name === 'CMailView') {
							initMoveToFolderButton(ModulesManager, params.View);
						}
					});
				}
			}
		};
	}

	return null;
};

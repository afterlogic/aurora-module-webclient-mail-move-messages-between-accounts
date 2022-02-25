'use strict';

const
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),

	App = require('%PathToCoreWebclientModule%/js/App.js'),
	Popups = require('%PathToCoreWebclientModule%/js/Popups.js')
;

module.exports = function (appData) {
	if (App.isUserNormalOrTenant()) {
		return {
			start: (ModulesManager) => {
				if (ModulesManager.isModuleIncluded('MailWebclient')) {
					App.subscribeEvent('MailWebclient::ConstructView::after', function (params) {
						if (params.Name === 'CMailView') {
							params.View.moveToFolderTemplate = '%ModuleName%_MoveButtonView';
							params.View.openMoveToFolderPopupCommand = Utils.createCommand(params.View, function () {
								const MoveToFolderPopup = require('modules/%ModuleName%/js/popups/MoveToFolderPopup.js');
								Popups.showPopup(MoveToFolderPopup, [params.View.oMessageList.checkedOrSelectedUids()]);
							}, params.View.isEnableGroupOperations);
						}
					});
				}
			}
		};
	}

	return null;
};

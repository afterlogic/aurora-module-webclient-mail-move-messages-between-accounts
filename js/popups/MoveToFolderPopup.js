'use strict';

var
	_ = require('underscore'),
	ko = require('knockout'),

	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),

	Ajax = require('%PathToCoreWebclientModule%/js/Ajax.js'),
	Api = require('%PathToCoreWebclientModule%/js/Api.js'),
	CAbstractPopup = require('%PathToCoreWebclientModule%/js/popups/CAbstractPopup.js'),
	ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
	Storage = require('%PathToCoreWebclientModule%/js/Storage.js'),

	Settings = require('modules/%ModuleName%/js/Settings.js'),

	AccountList = ModulesManager.run('MailWebclient', 'getAccountList'),
	MailCache = ModulesManager.run('MailWebclient', 'getMailCache')
;

/**
 * @constructor
 */
function CMoveToFolderPopup()
{
	CAbstractPopup.call(this);

	this.isSaving = ko.observable(false);

	this.checkedUids = ko.observableArray([]);
	this.checkedCount = ko.computed(function () {
		return this.checkedUids().length;
	}, this);
	this.popupHeading = ko.computed(function () {
		return TextUtils.i18n('%MODULENAME%/HEADING_MOVE_MESSAGES_PLURAL',
								{'COUNT': this.checkedCount()}, null, this.checkedCount());
	}, this);

	this.accounts = ko.observableArray([]);
	this.selectedAccountId = ko.observable(0);
	this.folders = ko.observableArray([]);
	this.selectedFolder = ko.observable('');

	this.folderListLoading = ko.computed(function () {
		return MailCache && this.selectedAccountId() !== 0
				? MailCache.folderListLoading.indexOf(this.selectedAccountId()) !== -1
				: false;
	}, this);
	this.folderListLoading.subscribe(function () {
		if (!this.folderListLoading()) {
			this.populateFolders();
		}
	}, this);

	this.step = ko.observable('folders');
	this.enableMoveButton = ko.computed(function () {
		return this.step() === 'folders' && this.selectedFolder();
	}, this);
	this.moveMessagesCommand = Utils.createCommand(this, this.moveMessages, this.enableMoveButton);

	this.messagesToMove = ko.observableArray([]);
	this.movingMessageNumber = ko.computed(function () {
		return this.checkedCount() - this.messagesToMove().length;
	}, this);
	this.movingInProgress = ko.computed(function () {
		return this.step() === 'moving' && !this.movingStopped() && this.movingMessageNumber() !== this.checkedCount();
	}, this);
	this.progressText = ko.computed(function () {
		if (this.movingInProgress()) {
			return this.movingMessageNumber() + '/' + this.checkedCount();
		}
		return '';
	}, this);

	this.movingStopped = ko.observable(false);
	this.movingEnded = ko.computed(function () {
		return this.step() === 'moving' && (this.movingStopped() || this.movingMessageNumber() === this.checkedCount());
	}, this);
	this.enableStopMoving = ko.computed(function () {
		return this.movingMessageNumber() < this.checkedCount();
	}, this);
	this.stopMovingCommand = Utils.createCommand(this, this.stopMoving, this.enableStopMoving);

	this.movingInfoText = ko.computed(function () {
		if (this.movingStopped()) {
			return TextUtils.i18n('%MODULENAME%/INFO_MESSAGES_PARTLY_MOVED', {
				COUNT: this.movingMessageNumber(),
				TOTAL_COUNT: this.checkedCount()
			});
		} else if (this.movingEnded()) {
			return TextUtils.i18n('%MODULENAME%/INFO_MESSAGES_MOVED');
		} else {
			return TextUtils.i18n('%MODULENAME%/INFO_MESSAGES_BEING_MOVED');
		}
	}, this);
}

_.extendOwn(CMoveToFolderPopup.prototype, CAbstractPopup.prototype);

CMoveToFolderPopup.prototype.PopupTemplate = '%ModuleName%_MoveToFolderPopup';

/**
 * @param {array} checkedUids
 * @param {observable array} moveHistoryData
 * @param {int} selectedAccountId
 * @param {string} selectedFolder
 */
CMoveToFolderPopup.prototype.onOpen = function (checkedUids, moveHistoryData, selectedAccountId, selectedFolder)
{
	if (!AccountList) {
		throw 'There is no AccountList';
	}

	this.checkedUids(checkedUids);
	this.moveHistoryData = moveHistoryData;

	this.accounts(AccountList.collection());
	this.selectedAccountId(selectedAccountId || AccountList.currentId());
	this.messagesToMove([]);
	this.movingStopped(false);

	this.populateFolders();

	if (selectedFolder) {
		this.selectedFolder(selectedFolder);
		this.moveMessages();
	} else {
		this.step('folders');
	}
};

CMoveToFolderPopup.prototype.openAccountsStep = function ()
{
	this.step('accounts');
};

CMoveToFolderPopup.prototype.selectAccount = function (accountId)
{
	if (accountId !== this.selectedAccountId()) {
		this.selectedAccountId(accountId);
		this.populateFolders();
	}
	this.step('folders');
};

CMoveToFolderPopup.prototype.selectFolder = function (folderFullName)
{
	this.selectedFolder(folderFullName);
};

CMoveToFolderPopup.prototype.populateFolders = function ()
{
	if (!AccountList) {
		throw 'There is no AccountList';
	}
	if (!MailCache) {
		throw 'There is no MailCache';
	}

	const folderList = MailCache.oFolderListItems[this.selectedAccountId()];
	if (folderList) {
		const disabledFolders = this.selectedAccountId() === AccountList.currentId()
								? [MailCache.getCurrentFolderFullname()]
								: [];
		this.folders(folderList.getOptions('', true, false, true, false, disabledFolders));
	} else {
		MailCache.getFolderList(this.selectedAccountId());
		this.folders([]);
	}
	this.selectedFolder('');
};

CMoveToFolderPopup.prototype.moveMessages = function ()
{
	if (!AccountList) {
		throw 'There is no AccountList';
	}
	if (!MailCache) {
		throw 'There is no MailCache';
	}

	const
		toAccount = AccountList.getAccount(this.selectedAccountId()),
		toFolderList = MailCache.oFolderListItems[this.selectedAccountId()],
		toFolder = toFolderList.getFolderByFullName(this.selectedFolder()),
		uidsByFolders = MailCache.getUidsSeparatedByFolders(this.checkedUids())
	;

	if (_.isFunction(this.moveHistoryData)) {
		const moveHistoryData = this.moveHistoryData().filter(data => {
			const isSameFolder = data.accountId === this.selectedAccountId() && data.folder === this.selectedFolder();
			return !isSameFolder;
		}, this);
		moveHistoryData.unshift({
			accountId: this.selectedAccountId(),
			accountEmail: toAccount.email(),
			folder: this.selectedFolder(),
			folderDisplayFullName: toFolder.displayFullName()
		});
		Storage.setData('aurora_custom_move-messages-history-data', moveHistoryData.slice(0, Settings.NumberOfRecordsInHistory + 1));
		this.moveHistoryData(Storage.getData('aurora_custom_move-messages-history-data') || []);
	}

	let messagesToMove = [];
	for (const key in uidsByFolders) {
		const
			data = uidsByFolders[key],
			accountId = data.iAccountId,
			folderList = MailCache.oFolderListItems[accountId]
		;
		if (folderList && accountId === this.selectedAccountId()) {
			const fromFolder = folderList.getFolderByFullName(data.sFolder);
			MailCache.moveMessagesToFolder(fromFolder, toFolder, data.aUids);
		} else {
			messagesToMove = messagesToMove.concat(data.aUids.map(uid => {
				return {
					accountId,
					folder: data.sFolder,
					uid
				};
			}));
		}
	};
	if (messagesToMove.length > 0 && !this.movingStopped()) {
		this.messagesToMove(messagesToMove);
		this.moveOneMessage();
	}
	this.step('moving');
};

CMoveToFolderPopup.prototype.moveOneMessage = function ()
{
	if (!MailCache) {
		throw 'There is no MailCache';
	}

	const messageData = this.messagesToMove.shift();
	const parameters = {
		'AccountID': messageData.accountId,
		'Folder': messageData.folder,
		'Uids': messageData.uid,
		'ToAccountID': this.selectedAccountId(),
		'ToFolder': this.selectedFolder()
	};

	const folderList = MailCache.oFolderListItems[messageData.accountId];
	const folder = folderList.getFolderByFullName(messageData.folder);
	folder.markDeletedByUids([messageData.uid]);
	MailCache.excludeDeletedMessages();

	Ajax.send('%ModuleName%', 'MoveMessages', parameters, this.onMoveMessagesResponse, this);
};

CMoveToFolderPopup.prototype.onMoveMessagesResponse = function (response, request)
{
	if (!MailCache) {
		throw 'There is no MailCache';
	}

	if (response && response.Result) {
		if (!this.movingStopped() && this.messagesToMove().length > 0) {
			this.moveOneMessage();
		}
	} else {
		this.movingStopped(true);
		const params = request.Parameters;
		const folderList = MailCache.oFolderListItems[params.AccountID];
		const folder = folderList.getFolderByFullName(params.Folder);
		folder.revertDeleted([params.Uids]);
		this.messagesToMove.unshift({
			accountId: params.AccountID,
			folder: params.Folder,
			uid: params.Uids
		});
		Api.showErrorByCode(response, TextUtils.i18n('MAILWEBCLIENT/ERROR_MOVING_MESSAGES'));
	}
};

CMoveToFolderPopup.prototype.stopMoving = function ()
{
	this.movingStopped(true);
};

CMoveToFolderPopup.prototype.cancelPopup = function ()
{
	if (!this.movingInProgress()) {
		this.closePopup();
	}
};

module.exports = new CMoveToFolderPopup();

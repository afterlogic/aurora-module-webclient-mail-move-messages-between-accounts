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

	this.messagesToMove = [];
	this.infoText = ko.observable('');
	this.progressText = ko.observable('');
	this.allowStopMoving = ko.observable(false);
}

_.extendOwn(CMoveToFolderPopup.prototype, CAbstractPopup.prototype);

CMoveToFolderPopup.prototype.PopupTemplate = '%ModuleName%_MoveToFolderPopup';

/**
 * @param {array} checkedUids
 */
CMoveToFolderPopup.prototype.onOpen = function (checkedUids)
{
	this.checkedUids(checkedUids);

	this.accounts(AccountList ? AccountList.collection() : []);
	this.selectedAccountId(AccountList ? AccountList.currentId() : 0);

	this.populateFolders();

	this.step('folders');
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
	if (!MailCache || !AccountList) {
		return;
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
	const uidsByFolders = MailCache.getUidsSeparatedByFolders(this.checkedUids());
	let messagesToMove = [];
	for (const key in uidsByFolders) {
		const
			data = uidsByFolders[key],
			accountId = data.iAccountId,
			folderList = MailCache.oFolderListItems[accountId]
		;
		if (folderList && accountId === this.selectedAccountId()) {
			const
				account = AccountList.getAccount(accountId),
				fromFolder = folderList.getFolderByFullName(data.sFolder),
				toFolder = folderList.getFolderByFullName(this.selectedFolder())
			;
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
	if (messagesToMove.length === 0) {
		this.infoText(TextUtils.i18n('%MODULENAME%/INFO_MESSAGES_MOVED'));
	} else {
		this.infoText(TextUtils.i18n('%MODULENAME%/INFO_MESSAGES_BEING_MOVED'));
		this.messagesToMove = messagesToMove;
		this.moveOneMessage();
	}
	this.step('moving');
};

CMoveToFolderPopup.prototype.moveOneMessage = function ()
{
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

	this.progressText((this.checkedCount() - this.messagesToMove.length) + '/' + this.checkedCount());
	Ajax.send('%ModuleName%', 'MoveMessages', parameters, this.onMoveMessagesResponse, this);
};

CMoveToFolderPopup.prototype.onMoveMessagesResponse = function (response, request)
{
	if (this.messagesToMove.length > 0) {
		this.moveOneMessage();
	} else {
		this.infoText(TextUtils.i18n('%MODULENAME%/INFO_MESSAGES_MOVED'));
		this.progressText('');
	}
};

CMoveToFolderPopup.prototype.stopMoving = function ()
{
	console.log('stopMoving coming soon...');
};

CMoveToFolderPopup.prototype.save = function ()
{
	if (this.editedFolder && this.editedFolder.parentFullName() !== this.parentFolder()) {
		const parameters = {
			'AccountID': this.editedFolder.iAccountId,
			'PrevFolderFullNameRaw': this.editedFolder.fullName(),
			'NewFolderNameInUtf8': this.folderName(),
			'ChangeParent': true,
			'NewParentFolder': this.parentFolder()
		};

		this.isSaving(true);
		Ajax.send('Mail', 'RenameFolder', parameters, this.onResponseFolderRename, this);
	} else if (this.editedFolder && this.editedFolder.name() !== this.folderName()) {
		const parameters = {
			'AccountID': this.editedFolder.iAccountId,
			'PrevFolderFullNameRaw': this.editedFolder.fullName(),
			'NewFolderNameInUtf8': this.folderName(),
			'ChangeParent': false
		};

		this.isSaving(true);
		Ajax.send('Mail', 'RenameFolder', parameters, this.onResponseFolderRename, this);
	} else {
		this.closePopup();
	}
};

CMoveToFolderPopup.prototype.onResponseFolderRename = function (response, request)
{
	if (!AccountList && !MailCache) return;

	if (response && response.Result && response.Result.FullName) {
		MailCache.getFolderList(AccountList.editedId());
	} else {
		this.isSaving(false);
		Api.showErrorByCode(response, TextUtils.i18n('MAILWEBCLIENT/ERROR_RENAME_FOLDER'));
		MailCache.getFolderList(AccountList.editedId());
	}
};

CMoveToFolderPopup.prototype.cancelPopup = function ()
{
	if (!this.isSaving()) {
		this.closePopup();
	}
};

module.exports = new CMoveToFolderPopup();

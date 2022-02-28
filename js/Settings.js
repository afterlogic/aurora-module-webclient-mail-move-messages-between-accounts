'use strict';

const
	_ = require('underscore'),

	Types = require('%PathToCoreWebclientModule%/js/utils/Types.js')
;

module.exports = {
	NumberOfRecordsInHistory: 3,

	/**
	 * Initializes settings from AppData object sections.
	 * 
	 * @param {Object} appData Object contained modules settings.
	 */
	init: function (appData)
	{
		const appDataSection = appData['%ModuleName%'];
		if (!_.isEmpty(appDataSection)) {
			this.NumberOfRecordsInHistory = Types.pInt(appDataSection.NumberOfRecordsInHistory, this.NumberOfRecordsInHistory);
		}
	}
};

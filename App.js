Ext.define('CustomApp', {
	extend : 'Rally.app.App',
	componentCls : 'app',
	launch : function() {
		this._getHasBlockedIds().then(this._createHasBlockedUSDataStore);
	},

	_getHasBlockedIds : function() {
		var that = this;

		var snapshots = that._getSnapshots({
			fetch : [ 'ObjectID', 'FormattedID', 'Name', 'Blocked' ],
			find : {
				"_TypeHierarchy" : "HierarchicalRequirement",
				"_PreviousValues.Blocked" : true,
				"Project" : this.context.getProject().ObjectID
			}
		});
		// "$or": [{"Blocked" : true}, {"_PreviousValues.Blocked" : true} ],

		return Deft.Promise.all([ snapshots ]).then(function(results) {
			var hasBlockedObjs = [];
			_.each(results[0], function(r) {
				if (hasBlockedObjs.indexOf(r) < 0) {
					hasBlockedObjs.push(r);
				}
			});
			return hasBlockedObjs;
		});
	},

	_getSnapshots : function(config) {
		var workspaceOid = this.context.getWorkspace().ObjectID;
		var deferred = new Deft.Deferred();
		Ext.create('Rally.data.lookback.SnapshotStore', _.merge({
			// TODO - account for > 20k results
			autoLoad : true,
			context : {
				workspace : '/workspace/' + workspaceOid
			},
			listeners : {
				load : function(store, data, success) {
					deferred.resolve(_.pluck(data, 'raw'));
				}
			}
		}, config));

		return deferred.getPromise();
	},

	_createHasBlockedUSDataStore : function(myData) {

		var hasBlockedUSArr = [], that = Rally.getApp();

		Ext.each(myData, function(data, index) {
			var hasBlockedUS = {};
			hasBlockedUS.ObjectID = data.ObjectID;
			hasBlockedUS.FormattedID = data.FormattedID;
			hasBlockedUS.Name = data.Name;
			hasBlockedUSArr.push(hasBlockedUS);
		});

		that.hasBlockedUSStore = Ext.create('Ext.data.Store', {
			fields : [ 'ObjectID', 'FormattedID', 'Name' ],
			data : hasBlockedUSArr
		});

		that._createHasBlockedUSPicker();
	},

	_createHasBlockedUSPicker : function() {
		var that = Rally.getApp();
		that.hasBlockedUSPicker = Ext.create('Ext.form.ComboBox', {
			fieldLabel : 'Has Blocked User Story ',
			store : this.hasBlockedUSStore,
			renderTo : Ext.getBody(),
			displayField : 'Name',
			queryMode : 'local',
			valueField : 'ObjectID',
			border : 1,
			style : {
				borderColor : '#000000',
				borderStyle : 'solid',
				borderWidth : '1px',
				height : '40px'
			},
			width : 400,
			padding : '10 5 5 10',
			margin : '10 5 5 10',
			shadow : 'frame',
			labelAlign : 'right',
			labelStyle : {
				margin : '10 5 5 10'
			},
			listeners : {
				select : function(combo, records, eOpts) {
					// console.log("Selected Milestone : ", combo.getValue());
					// console.log("Selected records : ", records);
					// console.log("Selected eOpts : ", eOpts);

					that._getBlockedDuration(combo.getValue(), true).then(function(duration){
						console.log("duration" , duration);
					});
				},
				scope : that
			}
		});

		that.add(that.hasBlockedUSPicker);
	},

	/**
	 * Get the blocked duration of the provided user story in days
	 */
	_getBlockedDuration : function(objId, onlyWorkingDays) {
		var that = Rally.getApp();
		var blockedSnapshots = that._getSnapshots({
			fetch : [ 'ObjectID', 'FormattedID', 'Name', 'Blocked' ],
			find : {
				"ObjectID" : objId,
				"_TypeHierarchy" : "HierarchicalRequirement",
				"$or" : [ {
					"Blocked" : true
				}, {
					"_PreviousValues.Blocked" : true
				} ],
				"Project" : this.context.getProject().ObjectID
			}
		});

		return Deft.Promise.all([ blockedSnapshots ]).then(function(results) {
			var blockedObjs = [];
			_.each(results[0], function(r) {
				if (blockedObjs.indexOf(r) < 0) {
					blockedObjs.push(r);
				}
			});
			return that._calculateBlockedDuration(blockedObjs, onlyWorkingDays);
		});
	},

	/**
	 * Calculate the blocked duration based on the block objects. If need only
	 * working days then set onlyWorkingDays as true, otherwise set false.
	 */
	_calculateBlockedDuration : function(blockedObjs, onlyWorkingDays) {
		var dayDuration = 0, isBlocked = false, validFrom = null, validTo = null, that = Rally.getApp();

		_.each(blockedObjs, function(blockedObj) {
			if (!isBlocked && blockedObj.Blocked) {
				isBlocked = true;
				validFrom = new Date(blockedObj._ValidFrom);
			} else if (!blockedObj.Blocked) {
				isBlocked = false;
				validTo = new Date(blockedObj._ValidTo);

				if (onlyWorkingDays) {
					dayDuration = dayDuration + that._getWorkingDayDiff(validTo, validFrom);
				} else {
					dayDuration = dayDuration + Rally.util.DateTime.getDifference(validTo, validFrom, 'day');
				}

				validFrom = null;
				validTo = null;
			}

		});

		if (isBlocked && validFrom !== null && validTo === null) {
			if (onlyWorkingDays) {
				dayDuration = dayDuration + that._getWorkingDayDiff(new Date(), validFrom);
			} else {
				dayDuration = dayDuration + Rally.util.DateTime.getDifference(new Date(), validFrom, 'day');
			}
		}

		return Math.round(dayDuration);
	},

	/**
	 * get the days difference of wo dates in days.
	 */
	_getWorkingDayDiff : function(endDate, startDate) {
		var currentDate = new Date(startDate), result = 0, weekDay, difference;
		var minutes = 1000 * 60;
		var hours = minutes * 60;
		var days = hours * 24;
		endDate = new Date(endDate);

		while (currentDate <= endDate) {
			difference = (endDate.getTime() / days) - (currentDate.getTime() / days);
			if (difference > 0) { // only count days when difference is >= 1
				// day
				weekDay = currentDate.getDay();
				if (weekDay !== 0 && weekDay !== 6) {
					result += difference > 1 ? 1 : difference;
				}
			}
			currentDate.setDate(currentDate.getDate() + 1);
		}
		return result;
	}
});

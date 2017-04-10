/**
 * FTC Scoring display
 *
 * Works by loading the html generated by the Scoring Software, and refactoring it into a more
 * friendly display format - specifically for mobile devices.
 *
 * All raw html files generated by the scoring system are converted into js objects.
 *
 * Where the data is loaded from is determined by the js/config.js file.
 */

var FTC = function( configFilePath ) {
	this.init( configFilePath );
}

FTC.prototype = {

	/**
	 * init()
	 *
	 * initializes everything
	 */
	init: function( configFilePath ) {
		var self = this;
		
		this.configFilePath = configFilePath || 'js/config.json';
		this.refreshInterval = 5 * 60 * 1000;	// interval between data refresh
		this.configModified = '';
		this.configId = 0;
		this.loadCount = 0;
		this.division = 0;
		this.showing = '';
		this.selected = '';
		this.raw = '';
		this.seq = 0;
		this.searchTeam = '';
		this.days = { Sat: 'Saturday', Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };
		
		this.isLocal = document.location.protocol === 'file:';
		
		$('header nav .types a').each(function(e){
			$(this).click( function(e) {
				self.show( $(this).attr('id').replace('type-','') );
				e.preventDefault();
			});
		});
		
		$('#timestamp').click( function(e){ self.toggleLoadInfo(); e.preventDefault(); } );
		$('#btn-refresh').click( function(e){ self.reload(); e.preventDefault(); } );
		$('#detail-back').click(function() { $(this).removeClass('visible'); });
		
		// set up presistence
		this.initLocalStorage();

		this.searchTeam = this.readLocalData( 'team' );
		if ( typeof(this.searchTeam) === 'string' ) {
			$('#team-input').val( this.searchTeam );
		}
		$('#team-input').on( 'change keyup paste', function() {
			self.searchTeam = $('#team-input').val().trim().replace( /[^0-9]/g, '' );
			self.saveLocalData( 'team', self.searchTeam );
			self.teamSearchChanged();
		});
		
		self.reload();
	},

	/**
	 * reload()
	 *
	 * forcibly refreshes all remote config & data
	 */
	reload: function() {
		var self = this;
		window.clearInterval( self.intervalId );
		self.intervalId = window.setInterval( function() { self.refresh(); }, self.refreshInterval );
		self.refresh();
	},
	
	/**
	 * refresh()
	 *
	 * checks remote config file for modifications
	 *	if changed, clears out all data, and possibly re-sets the ui (divisions may have changed)
	 * calls refreshData() to load all remote data
	 */
	refresh: function( continueLoading ) {
		var self = this;
		self.loading( true );
		$.ajax({
			url: self.configFilePath + '?r=' + new Date().getTime(),
			success: function(data, ststus, jqXHR) {
				var modified = jqXHR.getResponseHeader("Last-Modified");
				if ( modified != self.configModified ) {
					self.configModified = modified;
					self.configId += 1;

					self.data = [];
					for ( var n = 0; n < data.divisions.length && n < 2; n++ ) {
						var division = data.divisions[n];
						for ( var k in division.sources ) {
							division.sources[k] = {
								url: division.sources[k],
								modified: 0,
								status: 'not loaded'
							};
						}
						self.data.push( division );
					}


					if ( typeof(data.name) === 'string' && data.name.length > 0 ) {
						window.title = data.name;
					}

					if ( data.divisions.length === 2 ) {
						var html = '';
						for ( var n = 0; n < 2; n++ ) {
							var division = data.divisions[n];
							html += '<li><a href="#" id="division-' + n + '">' + division.name + '</a></il>';
						}
						$('ul.divisions').html( html );
					}
					else {
						if ( typeof(data.name) === 'string' && data.name.length > 0 ) {
							$('ul.divisions').html( '<h3>' + data.name + '</h3>' );
						}
						else {
							$('body').addClass('nodivisions');
						}
					}
					self.division = 0;
					self.firstLoad();
				}
				$('#timestamp').text( new Date().toLocaleTimeString() );
				self.refreshData();
				self.loading( false );
			},
			error: function(jqXHR, status, error) {
				self.error( error );
				self.loading( false );
			}
		});
	},
	
	/**
	 * firstLoad()
	 *
	 * attaches click events to division headers
	 * shows the data that was last seen, or 'matches'
	 */
	firstLoad: function() {
		var self = this;

		$('header nav .divisions a').each(function(){
			$(this).click( function(e) {
				self.setDivision( $(this).attr('id').replace('division-','') );
				e.preventDefault();
			});
		});
		
		self.selected = '';
		var which = this.readLocalData( 'which' ) || 'matches';
		this.show( which );
	},
	
	/**
	 * refreshData()
	 *
	 * checks all data sources for updates
	 */
	refreshData: function() {
		var self = this;

		for ( var n = 0; n < self.data.length; n++ ) {
			var division = self.data[n];
			for ( var k in division.sources ) {
				self.loadData(n, k);
			}
		}
	},
	
	/**
	 * setDivision()
	 *
	 * sets current selected division
	 * re-renders the main content view
	 */
	setDivision: function( which ) {
		var division = parseInt(which);
		if ( typeof division !== 'number' || isNaN(division) ) {
			division = 0;
		}
		if ( division !== this.division ) {
			this.division = division;
			this.saveLocalData( 'which', this.division + '-' + this.showing );
			
			$('header nav .divisions a').removeClass( 'selected' );
			$('#division-' + this.division).addClass( 'selected' );

			this.render();
		}
	},
	
	/**
	 * show()
	 *
	 * renders a particular slice of the data in the main content view
	 * 'which' can either be 'division-view', or just 'view'
	 */
	show: function( which ) {
		var self = this;
		
		if ( which.indexOf('-') !== -1 ) {
			var split = which.split("-");
			this.division = split[0];
			if ( typeof this.data === 'undefined'
					|| typeof this.data.divisions !== 'object'
					|| typeof this.data.divisions[this.division] !== 'object' ) {
				this.division = 0;
			}
			this.showing = split[1];
		}
		else {
			this.showing = which;
		}

		this.selected = this.division + '-' + this.showing;
		this.saveLocalData( 'which', this.selected );
		
		$('header nav a').removeClass( 'selected' );
		$('#division-' + this.division).addClass( 'selected' );
		$('#type-' + this.showing).addClass( 'selected' );
		
		this.render();
	},

	/**
	 * render()
	 *
	 * renders the content view based on division/tab selection
	 */
	render: function() {
		switch ( this.showing ) {
			case 'matches': this.renderMatches(); break;
			case 'results': this.renderResults(); break;
			case 'rankings': this.renderRankings(); break;
			case 'teams': this.renderTeams(); break;
		}
	},

	/**
	 * renderMatches()
	 *
	 * renders the match list
	 */
	renderMatches: function() {
		var data = this.data[ this.division ].data;

		var html = '';

		var emitHeader = function() {
			html += '<table class="matches">';
			html += '<thead><tr><th>Match</th>';
			if ( data && data.matchesHaveTime ) {
				html += '<th>Time</th>';
			}
			if ( data && data.matchesHaveField ) {
				html += '<th>Field</th>';
			}
			html += '<th>Red Teams</th><th>Blue Teams</th></tr></thead>';
		};

		if ( typeof data === 'object' && typeof data.matchList === 'object' ) {
			var day = '';

			if ( !data.matchesHaveTime ) {
				emitHeader();
				html += '<tbody>';
			}

			for ( var n = 0; n < data.matchList.length; n++ ) {
				var matchNum = data.matchList[n];
				var match = data.matches[matchNum];

				if ( data.matchesHaveTime && match.day != day ) {
					if ( day !== '' ) {
						html += '</tbody></table>';
					}
					day = match.day;
					if ( typeof day === 'string' && typeof this.days[match.day] === 'string' ) {
						html += '<h4>' + this.days[match.day] + '</h4>';
					}
					else {
						html += '<h4>&nbsp;</h4>';
					}
					emitHeader();
					html += '<tbody>';
				}
				var trClasses = match.red.teams.concat( match.blue.teams ).map( function (t){ return 'tr' + t.trim().replace('*', '');} ).join( ' ' );
				if ( typeof(this.searchTeam) === 'string' && match.teamNums.includes(this.searchTeam) ) {
					trClasses += ' team-highlight';
				}
				html += '<tr class="' + trClasses + '">';
				html += '<td>' + match.num + '</td>';
				if ( data.matchesHaveTime ) {
					html += '<td>' + (match.time || '') + '</td>';
				}
				if ( data.matchesHaveField ) {
					html += '<td>' + (match.field || '') + '</td>';
				}
				html += '<td class="red"><ul class="teams t' + match.red.teams.length + '"><li>' + match.red.teams.join('</li><li>') + '</li></ul></td>';
				html += '<td class="blue"><ul class="teams t' + match.blue.teams.length + '"><li>' + match.blue.teams.join('</li><li>') + '</li></ul></td>';
				html += '</tr>';
			}
		}
		html += '</tbody></table>';
		html += '<p><strong>Note:</strong> * Indicates a surrogate match.  Those matches do NOT count in the rankings</p>';

		$('#content').html( html );
	},

	/**
	 * renderResults()
	 *
	 * renders the match results list
	 */
	renderResults: function() {
		var self = this;

		var data = this.data[ this.division ].data;

		var html = '<table class="results">';
		html += '<thead><tr><th>Match</th><th>Result</th><th>Red</th><th>Blue</th><th>&nbsp;</th></tr></thead>';
		html += '<tbody>';
		if ( typeof data === 'object' && typeof data.matchList === 'object' ) {
			for ( var n = 0; n < data.matchList.length; n++ ) {
				var matchNum = data.matchList[n];
				var match = data.matches[matchNum];
				var className = match.winner === 'B' ? 'blue-won' : (match.winner === 'R' ? 'red-won' : 'tie');
				var trClasses = match.red.teams.concat( match.blue.teams ).map( function (t){ return 'tr' + t.trim().replace('*', '');} ).join( ' ' );
				if ( typeof(this.searchTeam) === 'string' && match.teamNums.includes(self.searchTeam) ) {
					trClasses += ' team-highlight';
				}
				html += '<tr data-num="' + match.num + '" class="' + trClasses + '">';
				html += '<td>' + match.num + '</td>';
				html += '<td class="' + className + '">' + match.result + '</td>';
				html += '<td class="red"><ul class="teams vert t' + match.red.teams.length + '"><li>' + match.red.teams.join('</li><li>') + '</li></ul></td>';
				html += '<td class="blue"><ul class="teams vert t' + match.blue.teams.length + '"><li>' + match.blue.teams.join('</li><li>') + '</li></ul></td>';
				html += '<td><a class="info">i</a></td>';
				html += '</tr>';
			}
		}
		html += '</tbody></table>';
		html += '<p><strong>Note:</strong> * Indicates a surrogate match.  Those matches do NOT count in the rankings</p>';

		$('#content').html( html );

		$('#content tbody tr').click(function() {
			var num = $(this).attr('data-num');
			self.showDetails( num );
		});
	},

	/**
	 * renderRankings()
	 *
	 * renders the team ranking list
	 */
	renderRankings: function() {
		var self = this;
		var data = this.data[ this.division ].data;

		var html = '<table class="rankings sortable">';
		html += '<thead><tr><th class="sort up" data-type="num" data-field="rank">Rank</th>';
		html += '<th data-type="num" data-field="teamNum">Team</th>';
		html += '<th data-type="num" data-field="qualityPts" data-order="dn">QP</th><th data-type="num" data-field="rankingPts" data-order="dn">RP</th>';
		html += '<th data-type="num" data-field="highest" data-order="dn">Highest</th><th data-type="num" data-field="matchesPlayed" data-order="dn">Matches</th></tr></thead>';
		html += '<tbody>';
		if ( typeof data === 'object' && typeof data.teams === 'object' ) {
			var list = [];
			for ( var k in data.teams ) {
				list.push( data.teams[k] );
			}
			list = list.sort(function(a, b) {
				var atype = typeof a.rank;
				var btype = typeof b.rank;
				if ( atype === 'number' && btype === 'number' ) { return a.rank - b.rank; }
				if ( atype === 'number' ) { return -1; }
				if ( btype === 'number' ) { return 1; }
				return 0;
			});
			for ( var k in list ) {
				var team = list[k];
				html += '<tr id="row' + team.teamNum + '" data-num="' + team.teamNum + '" class="tr' + team.teamNum;
				if ( typeof(this.searchTeam) === 'string' && team.teamNum == this.searchTeam ) {
					html += ' team-highlight';
				}
				html += '">';
				if ( typeof team.rank === 'number' ) {
					html += '<td>' + team.rank + '</td>';
					html += '<td><ul class="team-combo"><li>' + team.teamNum + '</li><li>' + team.name + '</li></ul></td>';
					html += '<td>' + team.qualityPts + '</td><td>' + team.rankingPts + '</td><td>' + team.highest + '</td>';
					html += '<td>' + team.matchesPlayed + '</td>';
				}
				else {
					html += '<td>&nbsp;</td>';
					html += '<td><ul class="team-combo"><li>' + (team.teamNum || '&nbsp;') + '</li><li>' + (team.name || '&nbsp;') + '</li></ul></td>';
					html += '<td></td><td></td><td></td><td></td>';
				}
				html += '</tr>';
			}
		}
		html += '</tbody></table>';

		$('#content').html( html );

		for ( var k in list ) {
			var team = list[k];
			$('#row' + team.teamNum).data('data', team);
		}

		$('#content tbody tr').click(function() {
			var num = $(this).attr('data-num');
			self.showDetailedTeamInfo( num );
		});

		this.makeSortable();
	},

	/**
	 * renderTeams()
	 *
	 * renders the teams list
	 */
	renderTeams: function() {
		var self = this;
		var data = this.data[ this.division ].data;

		var html = '<table class="teams sortable">';
		html += '<thead><tr><th class="sort" data-type="num" data-field="teamNum">Number</th>';
		html += '<th data-type="str" data-field="name">Name</th>' + /*'<th>School</th>*/ '<th data-type="str" data-field="city">Location</th><th>&nbsp;</th></tr></thead>';
		html += '<tbody>';
		if ( typeof data === 'object' && typeof data.teams === 'object' ) {
			var list = [];
			for ( var k in data.teams ) {
				list.push( data.teams[k] );
			}
			list = list.sort(function(a, b) {
				var atype = typeof a.teamNum;
				var btype = typeof b.teamNum;
				if ( atype === 'number' && btype === 'number' ) { return a.teamNum - b.teamNum; }
				if ( atype === 'number' ) { return -1; }
				if ( btype === 'number' ) { return 1; }
				return 0;
			});
			for ( var k in list ) {
				var team = list[k];
				html += '<tr id="row' + team.teamNum + '" data-num="' + team.teamNum + '" class="tr' + team.teamNum;
				if ( typeof(this.searchTeam) === 'string' && team.teamNum == self.searchTeam ) {
					html += ' team-highlight';
				}
				html += '">';
				html += '<td>' + team.teamNum + '</td><td>' + (team.name || '') + '</td>';//<td>' + (team.school || '') + '</td>';
				html += '<td>' + (team.city || '') + ', ' + (team.state || '') + ' ' + (team.country || '') + '</td>';
				html += '<td><a class="info">i</a></td>';
				html += '</tr>';
			}
		}
		html += '</tbody></table>';

		$('#content').html( html );

		for ( var k in list ) {
			var team = list[k];
			$('#row' + team.teamNum).data('data', team);
		}
		this.makeSortable();

		$('#content tbody tr').click(function() {
			var num = $(this).attr('data-num');
			self.showDetailedTeamInfo( num );
		});
	},

	/**
	 * makeSortable()
	 *
	 * makes a data table sortable by clicking a column header
	 * looking for sttributes in the header cells:
	 *		data-type	- 'num' or 'str'
	 *		data-field	- string, property name to sort on
	 *		data-order	- 'up' or 'dn'
	 * jquery data('data') object stored in each 'tbody tr' holds the data to sort with
	 */
	makeSortable: function() {
		var $heads = $('#content table.sortable th');
		$heads.click(function() {
			var $this = $(this);
			var type = $this.attr('data-type');
			var field = $this.attr('data-field');
			var order = $this.attr('data-order') || 'up';
			if ( $this.hasClass('sort') ) {
				if ( $this.hasClass('up') ) {
					order = 'dn';
				}
				else {
					order = 'up';
				}
			}

			var $rows = $('#content tbody tr');
			var rows = $rows.detach().toArray();

			if ( type === 'num' && order === 'up' ) {
				rows = rows.sort(function(a, b) {
					var a = $(a).data('data');
					var b = $(b).data('data');
					var atype = typeof a[field];
					var btype = typeof b[field];
					if ( atype === 'number' && btype === 'number' ) { return a[field] - b[field]; }
					if ( atype === 'number' ) { return 1; }
					if ( btype === 'number' ) { return -1; }
					return 0;
				});
			}
			else if ( type === 'num' && order === 'dn' ) {
				rows = rows.sort(function(a, b) {
					var a = $(a).data('data');
					var b = $(b).data('data');
					var atype = typeof a[field];
					var btype = typeof b[field];
					if ( atype === 'number' && btype === 'number' ) { return b[field] - a[field]; }
					if ( atype === 'number' ) { return -1; }
					if ( btype === 'number' ) { return 1; }
					return 0;
				});
			}
			else if ( type === 'str' && order === 'up' ) {
				rows = rows.sort(function(a, b) {
					var a = $(a).data('data');
					var b = $(b).data('data');
					var atype = typeof a[field];
					var btype = typeof b[field];
					if ( atype === 'string' && btype === 'string' ) { return a[field].localeCompare(b[field]); }
					if ( atype === 'string' ) { return 1; }
					if ( btype === 'string' ) { return -1; }
					return 0;
				});
			}
			else if ( type === 'str' && order === 'dn' ) {
				rows = rows.sort(function(a, b) {
					var a = $(a).data('data');
					var b = $(b).data('data');
					var atype = typeof a[field];
					var btype = typeof b[field];
					if ( atype === 'string' && btype === 'string' ) { return b[field].localeCompare(a[field]); }
					if ( atype === 'string' ) { return -1; }
					if ( btype === 'string' ) { return 1; }
					return 0;
				});
			}

			$heads.removeClass('sort up dn');
			$this.addClass('sort ' + order);
			$('#content tbody').append( rows );
		});
	},
	
	/**
	 * showDetails
	 *
	 * Appends a modal div that shows the detailed results of a match
	 * The detail data is grabbed from the "details" dictionary.
	 */
	showDetails: function( num ) {
		var self = this;
		var division = self.data[ self.division ];
		if ( typeof division === 'object' && typeof division.data.matches === 'object' && typeof division.data.matches[num] === 'object' ) {
			var match = division.data.matches[num];
			var html = '';
			var winner = match.winner === 'B' ? 'blue-won' : (match.winner === 'R' ? 'red-won' : 'tie');
			html += '<div class="detail-header">';
			html +=  '<h2 class="' + winner + '">Match ' + num + '</h2>';
			html +=  '<h3 class="' + winner + '">' + match.result + '</h3>';
			html += '</div>';
			html += '<div class="detail-body">';
			html +=  '<table class="details"><tr><th>&nbsp;</th><th class="red">Red</th><th class="blue">Blue</th></tr>';
			html +=  '<tr class="sep"><td>Teams</td>';
			html +=  '<td class="red rpad"><ul class="teams vert t' + match.red.teams.length + '"><li><strong>' + match.red.teams.join('</strong></li><li><strong>') + '</strong></li></ul></td>';
			html +=  '<td class="blue rpad"><ul class="teams vert t' + match.blue.teams.length + '"><li><strong>' + match.blue.teams.join('</strong></li><li><strong>') + '</strong></li></ul></td>';
			html +=  '</tr>';
			html +=  '<tr><td>Total Score</td><td class="red rpad">' + (match.red.total || '') + '</td><td class="blue rpad">' + (match.blue.total || '') + '</td></tr>';
			html +=  '<tr><td>Autonomous</td><td class="red rpad">' + (match.red.auto || '') + '</td><td class="blue rpad">' + (match.blue.auto || '') + '</td></tr>';
			html +=  '<tr><td>Auto Bonus</td><td class="red rpad">' + (match.red.autob || '') + '</td><td class="blue rpad">' + (match.blue.autob || '') + '</td></tr>';
			html +=  '<tr><td>Tele-Op</td><td class="red rpad">' + (match.red.tele || '') + '</td><td class="blue rpad">' + (match.blue.tele || '') + '</td></tr>';
			html +=  '<tr><td>End Game</td><td class="red rpad">' + (match.red.end || '') + '</td><td class="blue rpad">' + (match.blue.end || '') + '</td></tr>';
			html +=  '<tr><td>Penalties</td><td class="red rpad">' + (match.red.pen || '') + '</td><td class="blue rpad">' + (match.blue.pen || '') + '</td></tr>';
			html +=  '</table>';
			if ( match.surrogates.length > 0 ) {
				html += '<p><strong>Note:</strong> * Indicates a surrogate match.  Those matches do NOT count in the rankings</p>';
			}
			html += '</div>';
			$('#detail-box').html( html );
			
			$('#detail-back').addClass( 'visible' );
		}
	},
	
	/**
	 * showDetailedTeamInfo
	 *
	 * Appends a modal div that shows the detailed information about a team
	 * The detail data is grabbed from the "details" dictionary.
	 */
	showDetailedTeamInfo: function( num ) {
		var self = this;
		var division = self.data[ self.division ];
		if ( typeof division === 'object' && typeof division.data === 'object'
				&& typeof division.data.teams === 'object' && typeof division.data.teams[num] === 'object' ) {
			var team = division.data.teams[num];
			var html = '';
			html += '<div class="detail-header">';
			html +=  '<h2>Team ' + num + '</h2>';
			if ( typeof team.name === 'string' ) {
				html +=  '<h3>' + team.name + '</h3>';
			}
			html += '</div>';
			html += '<div class="detail-body">';
			if ( typeof team.school === 'string' ) {
				html +=  '<p>' + team.school + '<br>' + (team.city || '') + ', ' + (team.state || '') + ' ' + (team.country || '') + '</p>';
			}

			if ( typeof team.rank === 'number' ) {
				html += '<table class="details">';
				html += '<tr><td>Rank</td><td>' + team.rank + '</td></tr>';
				html += '<tr><td>Quality Pts</td><td>' + team.qualityPts + '</td></tr>';
				html += '<tr><td>Ranking Pts</td><td>' + team.rankingPts + '</td></tr>';
				html += '<tr><td>Matches Played</td><td>' + team.matchesPlayed + '</td></tr>';
				html += '</table>';
			}

			html += '<table class="details">';
			html += '<thead><tr><th>Match</th><th>Red Teams</th><th>Blue Teams</th></tr></thead>';
			html += '<tbody>';
			if ( typeof division.data.matchList === 'object' ) {
				for ( var n = 0; n < division.data.matchList.length; n++ ) {
					var matchNum = division.data.matchList[n];
					var match = division.data.matches[matchNum];
					if ( match.red.teams.includes(num) || match.blue.teams.includes(num) ) {
						html += '<tr>';
						html += '<td class="' + (match.winner||'').toLowerCase() +'won">' + match.num + '</td>';
						html += '<td class="red"><ul class="teams vert t' + match.red.teams.length + '"><li>' + match.red.teams.map(function(v){return (v===num)?'<b>'+num+'</b>':v;}).join('</li><li>') + '</li></ul></td>';
						html += '<td class="blue"><ul class="teams vert t' + match.blue.teams.length + '"><li>' + match.blue.teams.map(function(v){return (v===num)?'<b>'+num+'</b>':v;}).join('</li><li>') + '</li></ul></td>';
						html += '</tr>';
					}
				}
			}
			html +=  '</tbody></table>';
			html +=  '<p><strong>Note:</strong> * Indicates a surrogate match.  Those matches do NOT count in the rankings</p>';
			html += '</div>'

			$('#detail-box').html( html );
			
			$('#detail-back').addClass( 'visible' );
		}
	},

	teamSearchChanged: function() {
		$('#content tr').removeClass('team-highlight');
		if ( typeof(this.searchTeam) === 'string' ) {
			$('#content .tr' + this.searchTeam).addClass('team-highlight');
		}
	},
	
	highlightTeam: function() {
		var self = this;
		
		var team = $('#team-input').val();
		var $content = $('#content');
		
		$content.SearchHighlight({ exact:'partial', style_name_suffix:false, keys:team });
		$('#content .hilite').parents('tr').addClass('hirow');
	},

	/**
	 * loadData()
	 *
	 * loads one data source for a division and processes it when modified
	 */
	loadData: function( index, type ) {
		var self = this;

		if ( typeof self.data[index] !== 'object') {
			console.log( ' invalid division index: ' + index );
			return;
		}
		if ( typeof type !== 'string' || type.length === 0 || typeof self.data[index].sources[type] !== 'object' ) {
			console.log( ' invalid data type: ' + type + ' for division[' + index + ']' );
			return;
		}

		var source = self.data[index].sources[type];
		source.status = 'loading';
		self.loadHTML( source, function(status, data) {
			if ( status === 200 ) {
				source.status = 'loaded';
				switch( type ) {
					case 'matches': self.processMatchData(index, data); break;
					case 'details': self.processMatchDetailsData(index, data); break;
					case 'teams': self.processTeamsData(index, data); break;
					case 'rankings': self.processRankingsData(index, data); break;
				}
			}
			else if ( status === 304 ) {
				source.status = 'loaded';
			}
			else {
				source.status = 'error ' + status;
				self.error( status + ' error loading ' + source.url );
			}
		});
	},

	processMatchData: function( index, data ) {
		var self = this;

		var division = self.data[ index ];
		if ( typeof division !== 'object') {
			return;
		}

		// figure out which column for ech data type:
		var matchCol = 0;
		var timeCol = -1;
		var fieldCol = -1;
		var redCol1 = 1, redCol2;
		var blueCol1, blueCol2;

		// are match times available?
		if ( data.header[0].indexOf('Time') !== -1 ) {
			timeCol = 0;
			matchCol = 1;
			redCol1 = 2;
		}

		// how about field number?
		if ( data.header[matchCol + 1].indexOf('Field') !== -1 ) {
			fieldCol = matchCol + 1;
			redCol1 += 1;
		}

		// get red & blue columns...
		redCol2 = redCol1 + 1;
		while ( data.header[redCol2 + 1].indexOf('Red') !== -1 ) {
			redCol2 += 1;
		}
		blueCol1 = redCol1 + 1;
		blueCol2 = data.header.length - 1;
		//TODO: 

		// put the retrieved data in the division object:
		division.data = division.data || {};
		division.data.matches = division.data.matches || {};
		
		division.data.matchesHaveTime = (timeCol >= 0);
		division.data.matchesHaveField = (fieldCol >= 0);

		for ( var n = 0; n < data.rows.length; n++ ) {
			var row = data.rows[n];
			if ( row.length < 5 || row.length > 7 ) {
				continue;
			}
			var matchNum = row[ matchCol ];
			if ( matchNum.indexOf('-') === -1 ) {
				matchNum = 'Q-' + matchNum;
			}
			if ( typeof matchNum === 'string' ) {
				if ( typeof division.data.matches[matchNum] !== 'object' ) {
					division.data.matches[matchNum] = {}
				};
				var match = division.data.matches[matchNum];
				if ( timeCol >= 0 ) {
					var dt = row[ timeCol ].match( /(\w+) ([0-9\:]+) (AM|PM)/i );
					if ( dt.length === 4 ) {
						match.day = dt[ 1 ];
						match.time = dt[ 2 ];
						if ( dt[3] === 'AM' ) {
							match.time += '&nbsp;a';
						}
						else if ( dt[3] === 'PM' ) {
							match.time += '&nbsp;p';
						}
					}
				}
				if ( fieldCol >= 0 ) {
					match.field = row[ fieldCol ];
				}
				match.num = matchNum;
				match.red = match.red || {};
				match.blue = match.blue || {};
				match.red.teams = [];
				match.blue.teams = [];

				var surr = [];
				var num = (redCol2 - redCol1) + 1;
				for ( var t = 0; t < num; t++ ) {
					match.red.teams.push( row[redCol1 + t] );
					match.blue.teams.push( row[blueCol1 + t] );
					surr.push( row[redCol1 + t] );
					surr.push( row[blueCol1 + t] );
				}
				match.teamNums = match.red.teams.concat( match.blue.teams ).map(function(v){ return (v || '').replace('*', ''); });

				match.surrogates = surr
									.filter( function(v){ return (v || '').indexOf('*') !== -1; } )
									.map( function(v) { return (v || '').trim().replace('*', ''); } );
			}
		}

		// if the user is currently viewing the data just loaded, then re-render it:
		if ( self.selected === index + '-matches' ) {
			self.render();
		}
	},

	processMatchDetailsData: function( index, data ) {
		var self = this;

		var division = self.data[ index ];
		if ( typeof division !== 'object') {
			return;
		}

		// put the retrieved data in the division object:
		division.data = division.data || {};
		division.data.matches = division.data.matches || {};
		division.data.matchList = division.data.matchList || [];
		for ( var n = 0; n < data.rows.length; n++ ) {
			var row = data.rows[n];
			// we only care about this html file if it has macth time info
			//	all the other stuff is taken from the 
			if ( row.length === 16 ) {
				var matchNum = row[0];
				if ( typeof division.data.matches[matchNum] !== 'object' ) {
					division.data.matches[matchNum] = {}
				};
				var match = division.data.matches[matchNum];

				match.num = matchNum;
				match.result = row[1];
				if ( typeof match.result === 'string' && match.result.length > 0 ) {
					match.winner = match.result.substr(match.result.length - 1);
					match.red = match.red || {};
					match.red.teams = row[2].trim().split(' ').filter( function(v){return v.length>0;} );
					match.red.total = parseInt(row[4]);
					match.red.auto = parseInt(row[5]);
					match.red.autob = parseInt(row[6]);
					match.red.tele = parseInt(row[7]);
					match.red.end = parseInt(row[8]);
					match.red.pen = parseInt(row[9]);

					match.blue = match.blue || {};
					match.blue.teams = row[3].trim().split(' ').filter( function(v){return v.length>0;} );
					match.blue.total = parseInt(row[10]);
					match.blue.auto = parseInt(row[11]);
					match.blue.autob = parseInt(row[12]);
					match.blue.tele = parseInt(row[13]);
					match.blue.end = parseInt(row[14]);
					match.blue.pen = parseInt(row[15]);

					match.teamNums = match.red.teams.concat( match.blue.teams ).map(function(v){ return v.replace('*', ''); });
					match.surrogates = (row[2] + row[3]).split(' ')
										.filter( function(v){ return v.indexOf('*') !== -1; } )
										.map( function(v) { return v.trim().replace('*', ''); } );
				}
				division.data.matchList.push( matchNum );
			}
		}

		// if the user is currently viewing the data just loaded, then re-render it:
		if ( self.selected === index + '-matches' || self.selected === index + '-results' ) {
			self.render();
		}
	},

	processTeamsData: function( index, data ) {
		var self = this;

		var division = self.data[ index ];
		if ( typeof division !== 'object') {
			return;
		}

		// put the retrieved data in the division object:
		division.data = division.data || {};
		division.data.teams = division.data.teams || {};
		for ( var n = 0; n < data.rows.length; n++ ) {
			var row = data.rows[n];
			if ( row.length === 6 ) {
				var teamNum = row[0];
				if ( typeof division.data.teams[teamNum] !== 'object' ) {
					division.data.teams[teamNum] = {}
				};
				var team = division.data.teams[teamNum];
				team.teamNum = parseInt(teamNum);
				team.name = row[1];
				team.school = row[2];
				team.city = row[3];
				team.state = row[4];
				team.country = row[5];
			}
		}

		// if the user is currently viewing the data just loaded, then re-render it:
		if ( self.selected === index + '-rankings' || self.selected === index + '-teams' ) {
			self.render();
		}
	},

	processRankingsData: function( index, data ) {
		var self = this;

		var division = self.data[ index ];
		if ( typeof division !== 'object') {
			return;
		}

		// put the retrieved data in the division object:
		division.data = division.data || {};
		division.data.teams = division.data.teams || {};
		for ( var n = 0; n < data.rows.length; n++ ) {
			var row = data.rows[n];
			if ( row.length === 7 ) {
				var teamNum = row[1];
				if ( typeof division.data.teams[teamNum] !== 'object' ) {
					division.data.teams[teamNum] = {}
				};
				var team = division.data.teams[teamNum];
				team.teamNum = parseInt(teamNum);
				team.rank = parseInt(row[0]);
				team.qualityPts = parseInt(row[3]);
				team.rankingPts = parseInt(row[4]);
				team.highest = parseInt(row[5]);
				team.matchesPlayed = parseInt(row[6]);
			}
		}

		// if the user is currently viewing the data just loaded, then re-render it:
		if ( self.selected === index + '-rankings' || self.selected === index + '-teams' ) {
			self.render();
		}
	},

	/**
	 * loadHTML()
	 *
	 * fetch a single remote html file
	 *  check modification timestamp
	 *  when modified, extract table data
	 *
	 * call completion( httpStatusCode, data )
	 *	status code is 200, 304, 404, or other standard code
	 *	data is an object or undefined when status !== 200
	 *		{
	 *			header: [] array of cells in the tables header
	 *			rows: [] array of rows - each one an array of cells
	 *		}
	 */
	loadHTML: function( source, completion ) {
		var self = this;

		var url = source.url;
		if ( !self.isLocal ) {
			url += '?_=' + new Date().getTime();
		}

		self.loading( true );
		$.ajax({
			method: 'GET',
			url: url,
			dataType: 'html',
			ifModified: true,
			success: function(data, /*String*/ textStatus, /*jqXHR*/ jqXHR) {

				var modified = jqXHR.getResponseHeader("Last-Modified");
				if ( modified !== source.modified ) {
					source.modified = modified;

					var footer = data.replace( /[\s\S]*<\/TABLE><\/DIV>([\s\S]+)<\/HTML>/g, '$1');
					var table = data.replace( /[\s\S]*<DIV ALIGN=CENTER><TABLE([\s\S]+)<\/TABLE><\/DIV>([\s\S]+)<\/HTML>/g, '<TABLE$1</TABLE>');
					
					var header = [];
					var thr = table.match( /<TR[^>]*><TH[\s\S]+?<\/TR>/gi );
					if ( thr && thr.length === 1 ) {
						header = thr[0].replace( /<TR[^>]*>\s*<TH[^>]*>\s*/i, '')
								  .replace( /<\/TH><\/TR>/i, '' )
								  .replace( '&nbsp;', ' ' )
								  .split( /(?:<\/TH>){0,1}\s*<TH[^>]*>\s*/i );
					}

					var rows = [];
					var tr = table.match( /<TR[^>]*><TD[\s\S]+?<\/TR>/gi );
					if ( tr && tr.length > 0 ) {
						var rows = tr.map(function(row) {
							return row.replace( /<TR[^>]*>\s*<TD[^>]*>\s*/i, '')
									  .replace( /<\/TD><\/TR>/i, '' )
									  .replace( '&nbsp;', ' ' )
									  .split( /(?:<\/TD>){0,1}\s*<TD[^>]*>\s*/i );
						});
					}

					completion( 200, {header: header, rows: rows} );
				}
				else {
					console.log( 'not modified' );
					completion( 304 );
				}
				self.loading( false );
			},
			error: function(/*jqXHR*/jqXHR, /*String*/ textStatus, /*String*/ errorThrown) {
				self.error( textStatus + ' : ' + errorThrown + ' while loading ' + source.url );
				completion( 404 );
				self.loading( false );
			}
		});
	},

	/**
	 * toggleLoadInfo()
	 *
	 * show / hide the status of loaded data sources per division
	 */
	toggleLoadInfo: function() {
		var $info = $('#load-info');
		if ( !$info.hasClass('visible') ) {
			var html = '';

			for ( var n = 0; n < this.data.length; n++ ) {
				var division = this.data[n];
				html += '<p>' + division.name + '</p><ul>';
				for ( var k in division.sources ) {
					var source = division.sources[k];
					html += '<li><b>' + k + ' : <span class="' + source.status + '">' + source.status + '</span></b> <i>' + source.url + '</i>';
					html += ' <em>modified: ' + source.modified + '</em>';
					html += '</li>';
				}
				html += '</ul>';
			}
			$info.html( html );
		}
		$info.toggleClass('visible');
	},

	/**
	 * loading()
	 *
	 * increment / decrement loading counter
	 * spins the refresh arrows when counter > 0
	 */
	loading: function( loading ) {
		var self = this;
		self.loadCount += loading ? 1 : -1;
		// update loading count in bottom tool bar
		if ( self.loadCount > 0 ) {
			$('#btn-refresh').text( self.loadCount ).addClass( 'spin' );
		}
		else {
			self.loadCount = 0;
			$('#btn-refresh').text( '' ).removeClass( 'spin' );
		}
	},

	/**
	 * error()
	 *
	 * called when there's an error
	 */
	error : function( msg ) {
		console.error( msg );
	},
	
	/**
	 * initLocalStorage()
	 *
	 * sets up methods for persisting state across page loads.
	 * tries the localStorage Web API first, then falls back to cookies.
	 *
	 * functions made available:
	 *
	 *	this.saveLocalData( key, value )	// no return
	 *	this.readLocalData( key )			// returns string value or null
	 *	this.eraseLocalData( key ) 			// no return
	 */
	initLocalStorage: function()
	{
		this.canSaveData = false;
		this.hasLocalStorage = false;
		this.hasCookies = false;
		this.saveLocalData = function( key, value ) { }
		this.readLocalData = function( key ) { return null; }
		this.eraseLocalData = function( key ) { }

		var testkey = 'l0calTe5t';
		if ( typeof(Storage) !== 'undefined' ) {
			try {
				localStorage.setItem( testkey, 'works' );
				if ( localStorage.getItem(testkey) === 'works' ) {
					this.hasLocalStorage = true;
				}
				localStorage.removeItem( testkey );
			}
			catch (e) {
			}
		}
		
		if ( this.hasLocalStorage ) {
			this.saveLocalData = function( key, value ) {
				localStorage.setItem( 'ftc_' + key, value );
			}
			this.readLocalData = function( key ) {
				return localStorage.getItem( 'ftc_' + key );
			}
			this.eraseLocalData = function( key ) {
				localStorage.removeItem( 'ftc_' + key );
			}
		}
		
		else {
			document.cookie = testkey + '=works';
			
			var readCookie = function( key ) {
				var ca = document.cookie.split( ';' );
				var nameEQ = key + '=';
				for(var i=0; i < ca.length; i++) {
					var c = ca[i];
					while (c.charAt(0)===' ') c = c.substring(1, c.length); //delete spaces
					if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
				}
				return null;
			}
			
			var val = readCookie( testkey );
			if ( val === 'works' ) {
				this.hasCookies = true;
				document.cookie = testkey + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC';
			}
			
			if ( this.hasCookies ) {
				this.saveLocalData = function( key, value, days ) {
					if ( typeof(days) === 'undefined' ) {
						days = 30;
					}
					if ( days !== 0 ) {
						var date = new Date();
						date.setTime( date.getTime()+(days*24*60*60*1000) );
						var expires = '; expires=' + date.toGMTString();
					}
					else var expires = '';
					document.cookie = key + '=' + value + expires + '; path=/';
				}
				this.readLocalData = readCookie;
				this.eraseLocalData = function( key ) {
					document.cookie = key + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC';
				}
			}
		}
		
		this.canSaveData = this.hasLocalStorage || this.hasCookies;
	}
}

// Polyfill
if (!String.prototype.trim) {
  String.prototype.trim = function () {
    return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
  };
}


$(document).ready(function(){
	/**
	 * you can specify a config file here, if you like
	 *	(path is relative to the html file)
	 * e.g.:
	 *	var ftc = new FTC( 'sample-data/data-fake-just-started-config-with-teams.json' );
	 */
	var ftc = new FTC();
});


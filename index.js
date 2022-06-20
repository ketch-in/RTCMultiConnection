'use strict';
var RTCMultiConnection = function (roomid, forceOptions) {
};
var browserFakeUserAgent = 'Fake/5.0 (FakeOS) AppleWebKit/123 (KHTML, like Gecko) Fake/12.3.4567.89 Fake/123.45';
(function (that) {
    if (!that) {
        return;
    }
    if (typeof window !== 'undefined') {
        return;
    }
    if (typeof global === 'undefined') {
        return;
    }
    global.navigator = {
        userAgent: browserFakeUserAgent,
        getUserMedia: function () { }
    };
    if (!global.console) {
        global.console = {};
    }
    if (typeof global.console.debug === 'undefined') {
        global.console.debug = global.console.info = global.console.error = global.console.log = global.console.log || function () {
            console.log(arguments);
        };
    }
    if (typeof document === 'undefined') {
        /*global document:true */
        that.document = {};
        document.createElement = document.captureStream = document.mozCaptureStream = function () {
            var obj = {
                getContext: function () {
                    return obj;
                },
                play: function () { },
                pause: function () { },
                drawImage: function () { },
                toDataURL: function () {
                    return '';
                }
            };
            return obj;
        };
        document.addEventListener = document.removeEventListener = that.addEventListener = that.removeEventListener = function () { };
        that.HTMLVideoElement = that.HTMLMediaElement = function () { };
    }
    if (typeof io === 'undefined') {
        that.io = function () {
            return {
                on: function (eventName, callback) {
                    callback = callback || function () { };
                    if (eventName === 'connect') {
                        callback();
                    }
                },
                emit: function (eventName, data, callback) {
                    callback = callback || function () { };
                    if (eventName === 'open-room' || eventName === 'join-room') {
                        callback(true, data.sessionid, null);
                    }
                }
            };
        };
    }
    if (typeof location === 'undefined') {
        /*global location:true */
        that.location = {
            protocol: 'file:',
            href: '',
            hash: '',
            origin: 'self'
        };
    }
    if (typeof screen === 'undefined') {
        /*global screen:true */
        that.screen = {
            width: 0,
            height: 0
        };
    }
    if (typeof URL === 'undefined') {
        /*global screen:true */
        that.URL = {
            createObjectURL: function () {
                return '';
            },
            revokeObjectURL: function () {
                return '';
            }
        };
    }
    /*global window:true */
    that.window = global;
})(typeof global !== 'undefined' ? global : null);
function SocketConnection(connection, connectCallback) {
    function isData(session) {
        return !session.audio && !session.video && !session.screen && session.data;
    }
    var parameters = '';
    parameters += '?userid=' + connection.userid;
    parameters += '&sessionid=' + connection.sessionid;
    parameters += '&msgEvent=' + connection.socketMessageEvent;
    parameters += '&socketCustomEvent=' + connection.socketCustomEvent;
    parameters += '&autoCloseEntireSession=' + !!connection.autoCloseEntireSession;
    if (connection.session.broadcast === true) {
        parameters += '&oneToMany=true';
    }
    parameters += '&maxParticipantsAllowed=' + connection.maxParticipantsAllowed;
    if (connection.enableScalableBroadcast) {
        parameters += '&enableScalableBroadcast=true';
        parameters += '&maxRelayLimitPerUser=' + (connection.maxRelayLimitPerUser || 2);
    }
    parameters += '&extra=' + JSON.stringify(connection.extra || {});
    if (connection.socketCustomParameters) {
        parameters += connection.socketCustomParameters;
    }
    try {
        io.sockets = {};
    }
    catch (e) { }
    ;
    if (!connection.socketURL) {
        connection.socketURL = '/';
    }
    if (connection.socketURL.substr(connection.socketURL.length - 1, 1) != '/') {
        // connection.socketURL = 'https://domain.com:9001/';
        throw '"socketURL" MUST end with a slash.';
    }
    if (connection.enableLogs) {
        if (connection.socketURL == '/') {
            console.info('socket.io url is: ', location.origin + '/');
        }
        else {
            console.info('socket.io url is: ', connection.socketURL);
        }
    }
    try {
        connection.socket = io(connection.socketURL + parameters);
    }
    catch (e) {
        connection.socket = io.connect(connection.socketURL + parameters, connection.socketOptions);
    }
    var mPeer = connection.multiPeersHandler;
    connection.socket.on('extra-data-updated', function (remoteUserId, extra) {
        if (!connection.peers[remoteUserId])
            return;
        connection.peers[remoteUserId].extra = extra;
        connection.onExtraDataUpdated({
            userid: remoteUserId,
            extra: extra
        });
        updateExtraBackup(remoteUserId, extra);
    });
    function updateExtraBackup(remoteUserId, extra) {
        if (!connection.peersBackup[remoteUserId]) {
            connection.peersBackup[remoteUserId] = {
                userid: remoteUserId,
                extra: {}
            };
        }
        connection.peersBackup[remoteUserId].extra = extra;
    }
    function onMessageEvent(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.message.extra) {
            connection.peers[message.sender].extra = message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.extra
            });
            updateExtraBackup(message.sender, message.extra);
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'inactive' || action === 'stream-removed') {
                if (connection.peersBackup[stream.userid]) {
                    stream.extra = connection.peersBackup[stream.userid].extra;
                }
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            if (typeof stream.stream[action] == 'function') {
                stream.stream[action](type);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer) {
            if (connection.attachStreams.length) {
                connection.waitingForLocalMedia = false;
            }
            if (connection.waitingForLocalMedia) {
                // if someone is waiting to join you
                // make sure that we've local media before making a handshake
                setTimeout(function () {
                    onMessageEvent(message);
                }, 1);
                return;
            }
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () { }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    connection.socket.on(connection.socketMessageEvent, onMessageEvent);
    var alreadyConnected = false;
    connection.socket.resetProps = function () {
        alreadyConnected = false;
    };
    connection.socket.on('connect', function () {
        if (alreadyConnected) {
            return;
        }
        alreadyConnected = true;
        if (connection.enableLogs) {
            console.info('socket.io connection is opened.');
        }
        setTimeout(function () {
            connection.socket.emit('extra-data-updated', connection.extra);
        }, 1000);
        if (connectCallback) {
            connectCallback(connection.socket);
        }
    });
    connection.socket.on('disconnect', function (event) {
        connection.onSocketDisconnect(event);
    });
    connection.socket.on('error', function (event) {
        connection.onSocketError(event);
    });
    connection.socket.on('user-disconnected', function (remoteUserId) {
        if (remoteUserId === connection.userid) {
            return;
        }
        connection.onUserStatusChanged({
            userid: remoteUserId,
            status: 'offline',
            extra: connection.peers[remoteUserId] ? connection.peers[remoteUserId].extra || {} : {}
        });
        connection.deletePeer(remoteUserId);
    });
    connection.socket.on('user-connected', function (userid) {
        if (userid === connection.userid) {
            return;
        }
        connection.onUserStatusChanged({
            userid: userid,
            status: 'online',
            extra: connection.peers[userid] ? connection.peers[userid].extra || {} : {}
        });
    });
    connection.socket.on('closed-entire-session', function (sessionid, extra) {
        connection.leave();
        connection.onEntireSessionClosed({
            sessionid: sessionid,
            userid: sessionid,
            extra: extra
        });
    });
    connection.socket.on('userid-already-taken', function (useridAlreadyTaken, yourNewUserId) {
        connection.onUserIdAlreadyTaken(useridAlreadyTaken, yourNewUserId);
    });
    connection.socket.on('logs', function (log) {
        if (!connection.enableLogs)
            return;
        console.debug('server-logs', log);
    });
    connection.socket.on('number-of-broadcast-viewers-updated', function (data) {
        connection.onNumberOfBroadcastViewersUpdated(data);
    });
    connection.socket.on('set-isInitiator-true', function (sessionid) {
        if (sessionid != connection.sessionid)
            return;
        connection.isInitiator = true;
    });
}
function MultiPeers(connection) {
    var self = this;
    var skipPeers = ['getAllParticipants', 'getLength', 'selectFirst', 'streams', 'send', 'forEach'];
    connection.peers = {
        getLength: function () {
            var numberOfPeers = 0;
            for (var peer in this) {
                if (skipPeers.indexOf(peer) == -1) {
                    numberOfPeers++;
                }
            }
            return numberOfPeers;
        },
        selectFirst: function () {
            var firstPeer;
            for (var peer in this) {
                if (skipPeers.indexOf(peer) == -1) {
                    firstPeer = this[peer];
                }
            }
            return firstPeer;
        },
        getAllParticipants: function (sender) {
            var allPeers = [];
            for (var peer in this) {
                if (skipPeers.indexOf(peer) == -1 && peer != sender) {
                    allPeers.push(peer);
                }
            }
            return allPeers;
        },
        forEach: function (callback) {
            this.getAllParticipants().forEach(function (participant) {
                callback(connection.peers[participant]);
            });
        },
        send: function (data, remoteUserId) {
            var that = this;
            if (!isNull(data.size) && !isNull(data.type)) {
                if (connection.enableFileSharing) {
                    self.shareFile(data, remoteUserId);
                    return;
                }
                if (typeof data !== 'string') {
                    data = JSON.stringify(data);
                }
            }
            if (data.type !== 'text' && !(data instanceof ArrayBuffer) && !(data instanceof DataView)) {
                TextSender.send({
                    text: data,
                    channel: this,
                    connection: connection,
                    remoteUserId: remoteUserId
                });
                return;
            }
            if (data.type === 'text') {
                data = JSON.stringify(data);
            }
            if (remoteUserId) {
                var remoteUser = connection.peers[remoteUserId];
                if (remoteUser) {
                    if (!remoteUser.channels.length) {
                        connection.peers[remoteUserId].createDataChannel();
                        connection.renegotiate(remoteUserId);
                        setTimeout(function () {
                            that.send(data, remoteUserId);
                        }, 3000);
                        return;
                    }
                    remoteUser.channels.forEach(function (channel) {
                        channel.send(data);
                    });
                    return;
                }
            }
            this.getAllParticipants().forEach(function (participant) {
                if (!that[participant].channels.length) {
                    connection.peers[participant].createDataChannel();
                    connection.renegotiate(participant);
                    setTimeout(function () {
                        that[participant].channels.forEach(function (channel) {
                            channel.send(data);
                        });
                    }, 3000);
                    return;
                }
                that[participant].channels.forEach(function (channel) {
                    channel.send(data);
                });
            });
        }
    };
    this.uuid = connection.userid;
    this.getLocalConfig = function (remoteSdp, remoteUserId, userPreferences) {
        if (!userPreferences) {
            userPreferences = {};
        }
        return {
            streamsToShare: userPreferences.streamsToShare || {},
            rtcMultiConnection: connection,
            connectionDescription: userPreferences.connectionDescription,
            userid: remoteUserId,
            localPeerSdpConstraints: userPreferences.localPeerSdpConstraints,
            remotePeerSdpConstraints: userPreferences.remotePeerSdpConstraints,
            dontGetRemoteStream: !!userPreferences.dontGetRemoteStream,
            dontAttachLocalStream: !!userPreferences.dontAttachLocalStream,
            renegotiatingPeer: !!userPreferences.renegotiatingPeer,
            peerRef: userPreferences.peerRef,
            channels: userPreferences.channels || [],
            onLocalSdp: function (localSdp) {
                self.onNegotiationNeeded(localSdp, remoteUserId);
            },
            onLocalCandidate: function (localCandidate) {
                localCandidate = OnIceCandidateHandler.processCandidates(connection, localCandidate);
                if (localCandidate) {
                    self.onNegotiationNeeded(localCandidate, remoteUserId);
                }
            },
            remoteSdp: remoteSdp,
            onDataChannelMessage: function (message) {
                if (!connection.fbr && connection.enableFileSharing)
                    initFileBufferReader();
                if (typeof message == 'string' || !connection.enableFileSharing) {
                    self.onDataChannelMessage(message, remoteUserId);
                    return;
                }
                var that = this;
                if (message instanceof ArrayBuffer || message instanceof DataView) {
                    connection.fbr.convertToObject(message, function (object) {
                        that.onDataChannelMessage(object);
                    });
                    return;
                }
                if (message.readyForNextChunk) {
                    connection.fbr.getNextChunk(message, function (nextChunk, isLastChunk) {
                        connection.peers[remoteUserId].channels.forEach(function (channel) {
                            channel.send(nextChunk);
                        });
                    }, remoteUserId);
                    return;
                }
                if (message.chunkMissing) {
                    connection.fbr.chunkMissing(message);
                    return;
                }
                connection.fbr.addChunk(message, function (promptNextChunk) {
                    connection.peers[remoteUserId].peer.channel.send(promptNextChunk);
                });
            },
            onDataChannelError: function (error) {
                self.onDataChannelError(error, remoteUserId);
            },
            onDataChannelOpened: function (channel) {
                self.onDataChannelOpened(channel, remoteUserId);
            },
            onDataChannelClosed: function (event) {
                self.onDataChannelClosed(event, remoteUserId);
            },
            onRemoteStream: function (stream) {
                if (connection.peers[remoteUserId]) {
                    connection.peers[remoteUserId].streams.push(stream);
                }
                self.onGettingRemoteMedia(stream, remoteUserId);
            },
            onRemoteStreamRemoved: function (stream) {
                self.onRemovingRemoteMedia(stream, remoteUserId);
            },
            onPeerStateChanged: function (states) {
                self.onPeerStateChanged(states);
                if (states.iceConnectionState === 'new') {
                    self.onNegotiationStarted(remoteUserId, states);
                }
                if (states.iceConnectionState === 'connected') {
                    self.onNegotiationCompleted(remoteUserId, states);
                }
                if (states.iceConnectionState.search(/closed|failed/gi) !== -1) {
                    self.onUserLeft(remoteUserId);
                    self.disconnectWith(remoteUserId);
                }
            }
        };
    };
    this.createNewPeer = function (remoteUserId, userPreferences) {
        if (connection.maxParticipantsAllowed <= connection.getAllParticipants().length) {
            return;
        }
        userPreferences = userPreferences || {};
        if (connection.isInitiator && !!connection.session.audio && connection.session.audio === 'two-way' && !userPreferences.streamsToShare) {
            userPreferences.isOneWay = false;
            userPreferences.isDataOnly = false;
            userPreferences.session = connection.session;
        }
        if (!userPreferences.isOneWay && !userPreferences.isDataOnly) {
            userPreferences.isOneWay = true;
            this.onNegotiationNeeded({
                enableMedia: true,
                userPreferences: userPreferences
            }, remoteUserId);
            return;
        }
        userPreferences = connection.setUserPreferences(userPreferences, remoteUserId);
        var localConfig = this.getLocalConfig(null, remoteUserId, userPreferences);
        connection.peers[remoteUserId] = new PeerInitiator(localConfig);
    };
    this.createAnsweringPeer = function (remoteSdp, remoteUserId, userPreferences) {
        userPreferences = connection.setUserPreferences(userPreferences || {}, remoteUserId);
        var localConfig = this.getLocalConfig(remoteSdp, remoteUserId, userPreferences);
        connection.peers[remoteUserId] = new PeerInitiator(localConfig);
    };
    this.renegotiatePeer = function (remoteUserId, userPreferences, remoteSdp) {
        if (!connection.peers[remoteUserId]) {
            if (connection.enableLogs) {
                console.error('Peer (' + remoteUserId + ') does not exist. Renegotiation skipped.');
            }
            return;
        }
        if (!userPreferences) {
            userPreferences = {};
        }
        userPreferences.renegotiatingPeer = true;
        userPreferences.peerRef = connection.peers[remoteUserId].peer;
        userPreferences.channels = connection.peers[remoteUserId].channels;
        var localConfig = this.getLocalConfig(remoteSdp, remoteUserId, userPreferences);
        connection.peers[remoteUserId] = new PeerInitiator(localConfig);
    };
    this.replaceTrack = function (track, remoteUserId, isVideoTrack) {
        if (!connection.peers[remoteUserId]) {
            throw 'This peer (' + remoteUserId + ') does not exist.';
        }
        var peer = connection.peers[remoteUserId].peer;
        if (!!peer.getSenders && typeof peer.getSenders === 'function' && peer.getSenders().length) {
            peer.getSenders().forEach(function (rtpSender) {
                if (isVideoTrack && rtpSender.track.kind === 'video') {
                    connection.peers[remoteUserId].peer.lastVideoTrack = rtpSender.track;
                    rtpSender.replaceTrack(track);
                }
                if (!isVideoTrack && rtpSender.track.kind === 'audio') {
                    connection.peers[remoteUserId].peer.lastAudioTrack = rtpSender.track;
                    rtpSender.replaceTrack(track);
                }
            });
            return;
        }
        console.warn('RTPSender.replaceTrack is NOT supported.');
        this.renegotiatePeer(remoteUserId);
    };
    this.onNegotiationNeeded = function (message, remoteUserId) { };
    this.addNegotiatedMessage = function (message, remoteUserId) {
        if (message.type && message.sdp) {
            if (message.type == 'answer') {
                if (connection.peers[remoteUserId]) {
                    connection.peers[remoteUserId].addRemoteSdp(message);
                }
            }
            if (message.type == 'offer') {
                if (message.renegotiatingPeer) {
                    this.renegotiatePeer(remoteUserId, null, message);
                }
                else {
                    this.createAnsweringPeer(message, remoteUserId);
                }
            }
            if (connection.enableLogs) {
                console.log('Remote peer\'s sdp:', message.sdp);
            }
            return;
        }
        if (message.candidate) {
            if (connection.peers[remoteUserId]) {
                connection.peers[remoteUserId].addRemoteCandidate(message);
            }
            if (connection.enableLogs) {
                console.log('Remote peer\'s candidate pairs:', message.candidate);
            }
            return;
        }
        if (message.enableMedia) {
            connection.session = message.userPreferences.session || connection.session;
            if (connection.session.oneway && connection.attachStreams.length) {
                connection.attachStreams = [];
            }
            if (message.userPreferences.isDataOnly && connection.attachStreams.length) {
                connection.attachStreams.length = [];
            }
            var streamsToShare = {};
            connection.attachStreams.forEach(function (stream) {
                streamsToShare[stream.streamid] = {
                    isAudio: !!stream.isAudio,
                    isVideo: !!stream.isVideo,
                    isScreen: !!stream.isScreen
                };
            });
            message.userPreferences.streamsToShare = streamsToShare;
            self.onNegotiationNeeded({
                readyForOffer: true,
                userPreferences: message.userPreferences
            }, remoteUserId);
        }
        if (message.readyForOffer) {
            connection.onReadyForOffer(remoteUserId, message.userPreferences);
        }
        function cb(stream) {
            gumCallback(stream, message, remoteUserId);
        }
    };
    function gumCallback(stream, message, remoteUserId) {
        var streamsToShare = {};
        connection.attachStreams.forEach(function (stream) {
            streamsToShare[stream.streamid] = {
                isAudio: !!stream.isAudio,
                isVideo: !!stream.isVideo,
                isScreen: !!stream.isScreen
            };
        });
        message.userPreferences.streamsToShare = streamsToShare;
        self.onNegotiationNeeded({
            readyForOffer: true,
            userPreferences: message.userPreferences
        }, remoteUserId);
    }
    this.onGettingRemoteMedia = function (stream, remoteUserId) { };
    this.onRemovingRemoteMedia = function (stream, remoteUserId) { };
    this.onGettingLocalMedia = function (localStream) { };
    this.onLocalMediaError = function (error, constraints) {
        connection.onMediaError(error, constraints);
    };
    function initFileBufferReader() {
        connection.fbr = new FileBufferReader();
        connection.fbr.onProgress = function (chunk) {
            connection.onFileProgress(chunk);
        };
        connection.fbr.onBegin = function (file) {
            connection.onFileStart(file);
        };
        connection.fbr.onEnd = function (file) {
            connection.onFileEnd(file);
        };
    }
    this.shareFile = function (file, remoteUserId) {
        initFileBufferReader();
        connection.fbr.readAsArrayBuffer(file, function (uuid) {
            var arrayOfUsers = connection.getAllParticipants();
            if (remoteUserId) {
                arrayOfUsers = [remoteUserId];
            }
            arrayOfUsers.forEach(function (participant) {
                connection.fbr.getNextChunk(uuid, function (nextChunk) {
                    connection.peers[participant].channels.forEach(function (channel) {
                        channel.send(nextChunk);
                    });
                }, participant);
            });
        }, {
            userid: connection.userid,
            // extra: connection.extra,
            chunkSize: DetectRTC.browser.name === 'Firefox' ? 15 * 1000 : connection.chunkSize || 0
        });
    };
    if (typeof 'TextReceiver' !== 'undefined') {
        var textReceiver = new TextReceiver(connection);
    }
    this.onDataChannelMessage = function (message, remoteUserId) {
        textReceiver.receive(JSON.parse(message), remoteUserId, connection.peers[remoteUserId] ? connection.peers[remoteUserId].extra : {});
    };
    this.onDataChannelClosed = function (event, remoteUserId) {
        event.userid = remoteUserId;
        event.extra = connection.peers[remoteUserId] ? connection.peers[remoteUserId].extra : {};
        connection.onclose(event);
    };
    this.onDataChannelError = function (error, remoteUserId) {
        error.userid = remoteUserId;
        event.extra = connection.peers[remoteUserId] ? connection.peers[remoteUserId].extra : {};
        connection.onerror(error);
    };
    this.onDataChannelOpened = function (channel, remoteUserId) {
        // keep last channel only; we are not expecting parallel/channels channels
        if (connection.peers[remoteUserId].channels.length) {
            connection.peers[remoteUserId].channels = [channel];
            return;
        }
        connection.peers[remoteUserId].channels.push(channel);
        connection.onopen({
            userid: remoteUserId,
            extra: connection.peers[remoteUserId] ? connection.peers[remoteUserId].extra : {},
            channel: channel
        });
    };
    this.onPeerStateChanged = function (state) {
        connection.onPeerStateChanged(state);
    };
    this.onNegotiationStarted = function (remoteUserId, states) { };
    this.onNegotiationCompleted = function (remoteUserId, states) { };
    this.getRemoteStreams = function (remoteUserId) {
        remoteUserId = remoteUserId || connection.peers.getAllParticipants()[0];
        return connection.peers[remoteUserId] ? connection.peers[remoteUserId].streams : [];
    };
}
// Last Updated On: 2020-08-12 11:18:41 AM UTC
// ________________
// DetectRTC v1.4.1
// Open-Sourced: https://github.com/muaz-khan/DetectRTC
// --------------------------------------------------
// Muaz Khan     - www.MuazKhan.com
// MIT License   - www.WebRTC-Experiment.com/licence
// --------------------------------------------------
(function () {
    var browserFakeUserAgent = 'Fake/5.0 (FakeOS) AppleWebKit/123 (KHTML, like Gecko) Fake/12.3.4567.89 Fake/123.45';
    var isNodejs = typeof process === 'object' && typeof process.versions === 'object' && process.versions.node && /*node-process*/ !process.browser;
    if (isNodejs) {
        var version = process.versions.node.toString().replace('v', '');
        browserFakeUserAgent = 'Nodejs/' + version + ' (NodeOS) AppleWebKit/' + version + ' (KHTML, like Gecko) Nodejs/' + version + ' Nodejs/' + version;
    }
    (function (that) {
        if (typeof window !== 'undefined') {
            return;
        }
        if (typeof window === 'undefined' && typeof global !== 'undefined') {
            global.navigator = {
                userAgent: browserFakeUserAgent,
                getUserMedia: function () { }
            };
            /*global window:true */
            that.window = global;
        }
        else if (typeof window === 'undefined') {
            // window = this;
        }
        if (typeof location === 'undefined') {
            /*global location:true */
            that.location = {
                protocol: 'file:',
                href: '',
                hash: ''
            };
        }
        if (typeof screen === 'undefined') {
            /*global screen:true */
            that.screen = {
                width: 0,
                height: 0
            };
        }
    })(typeof global !== 'undefined' ? global : window);
    /*global navigator:true */
    var navigator = window.navigator;
    if (typeof navigator !== 'undefined') {
        if (typeof navigator.webkitGetUserMedia !== 'undefined') {
            navigator.getUserMedia = navigator.webkitGetUserMedia;
        }
        if (typeof navigator.mozGetUserMedia !== 'undefined') {
            navigator.getUserMedia = navigator.mozGetUserMedia;
        }
    }
    else {
        navigator = {
            getUserMedia: function () { },
            userAgent: browserFakeUserAgent
        };
    }
    var isMobileDevice = !!(/Android|webOS|iPhone|iPad|iPod|BB10|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(navigator.userAgent || ''));
    var isEdge = navigator.userAgent.indexOf('Edge') !== -1 && (!!navigator.msSaveOrOpenBlob || !!navigator.msSaveBlob);
    var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
    var isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1 && ('netscape' in window) && / rv:/.test(navigator.userAgent);
    var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    var isChrome = !!window.chrome && !isOpera;
    var isIE = typeof document !== 'undefined' && !!document.documentMode && !isEdge;
    // this one can also be used:
    // https://www.websocket.org/js/stuff.js (DetectBrowser.js)
    function getBrowserInfo() {
        var nVer = navigator.appVersion;
        var nAgt = navigator.userAgent;
        var browserName = navigator.appName;
        var fullVersion = '' + parseFloat(navigator.appVersion);
        var majorVersion = parseInt(navigator.appVersion, 10);
        var nameOffset, verOffset, ix;
        // In Opera, the true version is after 'Opera' or after 'Version'
        if (isOpera) {
            browserName = 'Opera';
            try {
                fullVersion = navigator.userAgent.split('OPR/')[1].split(' ')[0];
                majorVersion = fullVersion.split('.')[0];
            }
            catch (e) {
                fullVersion = '0.0.0.0';
                majorVersion = 0;
            }
        }
        // In MSIE version <=10, the true version is after 'MSIE' in userAgent
        // In IE 11, look for the string after 'rv:'
        else if (isIE) {
            verOffset = nAgt.indexOf('rv:');
            if (verOffset > 0) { //IE 11
                fullVersion = nAgt.substring(verOffset + 3);
            }
            else { //IE 10 or earlier
                verOffset = nAgt.indexOf('MSIE');
                fullVersion = nAgt.substring(verOffset + 5);
            }
            browserName = 'IE';
        }
        // In Chrome, the true version is after 'Chrome' 
        else if (isChrome) {
            verOffset = nAgt.indexOf('Chrome');
            browserName = 'Chrome';
            fullVersion = nAgt.substring(verOffset + 7);
        }
        // In Safari, the true version is after 'Safari' or after 'Version' 
        else if (isSafari) {
            // both and safri and chrome has same userAgent
            if (nAgt.indexOf('CriOS') !== -1) {
                verOffset = nAgt.indexOf('CriOS');
                browserName = 'Chrome';
                fullVersion = nAgt.substring(verOffset + 6);
            }
            else if (nAgt.indexOf('FxiOS') !== -1) {
                verOffset = nAgt.indexOf('FxiOS');
                browserName = 'Firefox';
                fullVersion = nAgt.substring(verOffset + 6);
            }
            else {
                verOffset = nAgt.indexOf('Safari');
                browserName = 'Safari';
                fullVersion = nAgt.substring(verOffset + 7);
                if ((verOffset = nAgt.indexOf('Version')) !== -1) {
                    fullVersion = nAgt.substring(verOffset + 8);
                }
                if (navigator.userAgent.indexOf('Version/') !== -1) {
                    fullVersion = navigator.userAgent.split('Version/')[1].split(' ')[0];
                }
            }
        }
        // In Firefox, the true version is after 'Firefox' 
        else if (isFirefox) {
            verOffset = nAgt.indexOf('Firefox');
            browserName = 'Firefox';
            fullVersion = nAgt.substring(verOffset + 8);
        }
        // In most other browsers, 'name/version' is at the end of userAgent 
        else if ((nameOffset = nAgt.lastIndexOf(' ') + 1) < (verOffset = nAgt.lastIndexOf('/'))) {
            browserName = nAgt.substring(nameOffset, verOffset);
            fullVersion = nAgt.substring(verOffset + 1);
            if (browserName.toLowerCase() === browserName.toUpperCase()) {
                browserName = navigator.appName;
            }
        }
        if (isEdge) {
            browserName = 'Edge';
            fullVersion = navigator.userAgent.split('Edge/')[1];
            // fullVersion = parseInt(navigator.userAgent.match(/Edge\/(\d+).(\d+)$/)[2], 10).toString();
        }
        // trim the fullVersion string at semicolon/space/bracket if present
        if ((ix = fullVersion.search(/[; \)]/)) !== -1) {
            fullVersion = fullVersion.substring(0, ix);
        }
        majorVersion = parseInt('' + fullVersion, 10);
        if (isNaN(majorVersion)) {
            fullVersion = '' + parseFloat(navigator.appVersion);
            majorVersion = parseInt(navigator.appVersion, 10);
        }
        return {
            fullVersion: fullVersion,
            version: majorVersion,
            name: browserName,
            isPrivateBrowsing: false
        };
    }
    // via: https://gist.github.com/cou929/7973956
    function retry(isDone, next) {
        var currentTrial = 0, maxRetry = 50, interval = 10, isTimeout = false;
        var id = window.setInterval(function () {
            if (isDone()) {
                window.clearInterval(id);
                next(isTimeout);
            }
            if (currentTrial++ > maxRetry) {
                window.clearInterval(id);
                isTimeout = true;
                next(isTimeout);
            }
        }, 10);
    }
    function isIE10OrLater(userAgent) {
        var ua = userAgent.toLowerCase();
        if (ua.indexOf('msie') === 0 && ua.indexOf('trident') === 0) {
            return false;
        }
        var match = /(?:msie|rv:)\s?([\d\.]+)/.exec(ua);
        if (match && parseInt(match[1], 10) >= 10) {
            return true;
        }
        return false;
    }
    function detectPrivateMode(callback) {
        var isPrivate;
        try {
            if (window.webkitRequestFileSystem) {
                window.webkitRequestFileSystem(window.TEMPORARY, 1, function () {
                    isPrivate = false;
                }, function (e) {
                    isPrivate = true;
                });
            }
            else if (window.indexedDB && /Firefox/.test(window.navigator.userAgent)) {
                var db;
                try {
                    db = window.indexedDB.open('test');
                    db.onerror = function () {
                        return true;
                    };
                }
                catch (e) {
                    isPrivate = true;
                }
                if (typeof isPrivate === 'undefined') {
                    retry(function isDone() {
                        return db.readyState === 'done' ? true : false;
                    }, function next(isTimeout) {
                        if (!isTimeout) {
                            isPrivate = db.result ? false : true;
                        }
                    });
                }
            }
            else if (isIE10OrLater(window.navigator.userAgent)) {
                isPrivate = false;
                try {
                    if (!window.indexedDB) {
                        isPrivate = true;
                    }
                }
                catch (e) {
                    isPrivate = true;
                }
            }
            else if (window.localStorage && /Safari/.test(window.navigator.userAgent)) {
                try {
                    window.localStorage.setItem('test', 1);
                }
                catch (e) {
                    isPrivate = true;
                }
                if (typeof isPrivate === 'undefined') {
                    isPrivate = false;
                    window.localStorage.removeItem('test');
                }
            }
        }
        catch (e) {
            isPrivate = false;
        }
        retry(function isDone() {
            return typeof isPrivate !== 'undefined' ? true : false;
        }, function next(isTimeout) {
            callback(isPrivate);
        });
    }
    var isMobile = {
        Android: function () {
            return navigator.userAgent.match(/Android/i);
        },
        BlackBerry: function () {
            return navigator.userAgent.match(/BlackBerry|BB10/i);
        },
        iOS: function () {
            return navigator.userAgent.match(/iPhone|iPad|iPod/i);
        },
        Opera: function () {
            return navigator.userAgent.match(/Opera Mini/i);
        },
        Windows: function () {
            return navigator.userAgent.match(/IEMobile/i);
        },
        any: function () {
            return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
        },
        getOsName: function () {
            var osName = 'Unknown OS';
            if (isMobile.Android()) {
                osName = 'Android';
            }
            if (isMobile.BlackBerry()) {
                osName = 'BlackBerry';
            }
            if (isMobile.iOS()) {
                osName = 'iOS';
            }
            if (isMobile.Opera()) {
                osName = 'Opera Mini';
            }
            if (isMobile.Windows()) {
                osName = 'Windows';
            }
            return osName;
        }
    };
    // via: http://jsfiddle.net/ChristianL/AVyND/
    function detectDesktopOS() {
        var unknown = '-';
        var nVer = navigator.appVersion;
        var nAgt = navigator.userAgent;
        var os = unknown;
        var clientStrings = [{
                s: 'Chrome OS',
                r: /CrOS/
            }, {
                s: 'Windows 10',
                r: /(Windows 10.0|Windows NT 10.0)/
            }, {
                s: 'Windows 8.1',
                r: /(Windows 8.1|Windows NT 6.3)/
            }, {
                s: 'Windows 8',
                r: /(Windows 8|Windows NT 6.2)/
            }, {
                s: 'Windows 7',
                r: /(Windows 7|Windows NT 6.1)/
            }, {
                s: 'Windows Vista',
                r: /Windows NT 6.0/
            }, {
                s: 'Windows Server 2003',
                r: /Windows NT 5.2/
            }, {
                s: 'Windows XP',
                r: /(Windows NT 5.1|Windows XP)/
            }, {
                s: 'Windows 2000',
                r: /(Windows NT 5.0|Windows 2000)/
            }, {
                s: 'Windows ME',
                r: /(Win 9x 4.90|Windows ME)/
            }, {
                s: 'Windows 98',
                r: /(Windows 98|Win98)/
            }, {
                s: 'Windows 95',
                r: /(Windows 95|Win95|Windows_95)/
            }, {
                s: 'Windows NT 4.0',
                r: /(Windows NT 4.0|WinNT4.0|WinNT|Windows NT)/
            }, {
                s: 'Windows CE',
                r: /Windows CE/
            }, {
                s: 'Windows 3.11',
                r: /Win16/
            }, {
                s: 'Android',
                r: /Android/
            }, {
                s: 'Open BSD',
                r: /OpenBSD/
            }, {
                s: 'Sun OS',
                r: /SunOS/
            }, {
                s: 'Linux',
                r: /(Linux|X11)/
            }, {
                s: 'iOS',
                r: /(iPhone|iPad|iPod)/
            }, {
                s: 'Mac OS X',
                r: /Mac OS X/
            }, {
                s: 'Mac OS',
                r: /(MacPPC|MacIntel|Mac_PowerPC|Macintosh)/
            }, {
                s: 'QNX',
                r: /QNX/
            }, {
                s: 'UNIX',
                r: /UNIX/
            }, {
                s: 'BeOS',
                r: /BeOS/
            }, {
                s: 'OS/2',
                r: /OS\/2/
            }, {
                s: 'Search Bot',
                r: /(nuhk|Googlebot|Yammybot|Openbot|Slurp|MSNBot|Ask Jeeves\/Teoma|ia_archiver)/
            }];
        for (var i = 0, cs; cs = clientStrings[i]; i++) {
            if (cs.r.test(nAgt)) {
                os = cs.s;
                break;
            }
        }
        var osVersion = unknown;
        if (/Windows/.test(os)) {
            if (/Windows (.*)/.test(os)) {
                osVersion = /Windows (.*)/.exec(os)[1];
            }
            os = 'Windows';
        }
        switch (os) {
            case 'Mac OS X':
                if (/Mac OS X (10[\.\_\d]+)/.test(nAgt)) {
                    osVersion = /Mac OS X (10[\.\_\d]+)/.exec(nAgt)[1];
                }
                break;
            case 'Android':
                if (/Android ([\.\_\d]+)/.test(nAgt)) {
                    osVersion = /Android ([\.\_\d]+)/.exec(nAgt)[1];
                }
                break;
            case 'iOS':
                if (/OS (\d+)_(\d+)_?(\d+)?/.test(nAgt)) {
                    osVersion = /OS (\d+)_(\d+)_?(\d+)?/.exec(nVer);
                    if (osVersion && osVersion.length > 3) {
                        osVersion = osVersion[1] + '.' + osVersion[2] + '.' + (osVersion[3] | 0);
                    }
                }
                break;
        }
        return {
            osName: os,
            osVersion: osVersion
        };
    }
    var osName = 'Unknown OS';
    var osVersion = 'Unknown OS Version';
    function getAndroidVersion(ua) {
        ua = (ua || navigator.userAgent).toLowerCase();
        var match = ua.match(/android\s([0-9\.]*)/);
        return match ? match[1] : false;
    }
    var osInfo = detectDesktopOS();
    if (osInfo && osInfo.osName && osInfo.osName != '-') {
        osName = osInfo.osName;
        osVersion = osInfo.osVersion;
    }
    else if (isMobile.any()) {
        osName = isMobile.getOsName();
        if (osName == 'Android') {
            osVersion = getAndroidVersion();
        }
    }
    var isNodejs = typeof process === 'object' && typeof process.versions === 'object' && process.versions.node;
    if (osName === 'Unknown OS' && isNodejs) {
        osName = 'Nodejs';
        osVersion = process.versions.node.toString().replace('v', '');
    }
    var isCanvasSupportsStreamCapturing = false;
    var isVideoSupportsStreamCapturing = false;
    ['captureStream', 'mozCaptureStream', 'webkitCaptureStream'].forEach(function (item) {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
            return;
        }
        if (!isCanvasSupportsStreamCapturing && item in document.createElement('canvas')) {
            isCanvasSupportsStreamCapturing = true;
        }
        if (!isVideoSupportsStreamCapturing && item in document.createElement('video')) {
            isVideoSupportsStreamCapturing = true;
        }
    });
    var regexIpv4Local = /^(192\.168\.|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01]))/, regexIpv4 = /([0-9]{1,3}(\.[0-9]{1,3}){3})/, regexIpv6 = /[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7}/;
    // via: https://github.com/diafygi/webrtc-ips
    function DetectLocalIPAddress(callback, stream) {
        if (!DetectRTC.isWebRTCSupported) {
            return;
        }
        var isPublic = true, isIpv4 = true;
        getIPs(function (ip) {
            if (!ip) {
                callback(); // Pass nothing to tell that ICE-gathering-ended
            }
            else if (ip.match(regexIpv4Local)) {
                isPublic = false;
                callback('Local: ' + ip, isPublic, isIpv4);
            }
            else if (ip.match(regexIpv6)) { //via https://ourcodeworld.com/articles/read/257/how-to-get-the-client-ip-address-with-javascript-only
                isIpv4 = false;
                callback('Public: ' + ip, isPublic, isIpv4);
            }
            else {
                callback('Public: ' + ip, isPublic, isIpv4);
            }
        }, stream);
    }
    function getIPs(callback, stream) {
        if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
            return;
        }
        var ipDuplicates = {};
        var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
        if (!RTCPeerConnection) {
            var iframe = document.getElementById('iframe');
            if (!iframe) {
                return;
            }
            var win = iframe.contentWindow;
            RTCPeerConnection = win.RTCPeerConnection || win.mozRTCPeerConnection || win.webkitRTCPeerConnection;
        }
        if (!RTCPeerConnection) {
            return;
        }
        var peerConfig = null;
        if (DetectRTC.browser === 'Chrome' && DetectRTC.browser.version < 58) {
            // todo: add support for older Opera
            peerConfig = {
                optional: [{
                        RtpDataChannels: true
                    }]
            };
        }
        var servers = {
            iceServers: [{
                    urls: 'stun:stun.l.google.com:19302'
                }]
        };
        var pc = new RTCPeerConnection(servers, peerConfig);
        if (stream) {
            if (pc.addStream) {
                pc.addStream(stream);
            }
            else if (pc.addTrack && stream.getTracks()[0]) {
                pc.addTrack(stream.getTracks()[0], stream);
            }
        }
        function handleCandidate(candidate) {
            if (!candidate) {
                callback(); // Pass nothing to tell that ICE-gathering-ended
                return;
            }
            var match = regexIpv4.exec(candidate);
            if (!match) {
                return;
            }
            var ipAddress = match[1];
            var isPublic = (candidate.match(regexIpv4Local)), isIpv4 = true;
            if (ipDuplicates[ipAddress] === undefined) {
                callback(ipAddress, isPublic, isIpv4);
            }
            ipDuplicates[ipAddress] = true;
        }
        // listen for candidate events
        pc.onicecandidate = function (event) {
            if (event.candidate && event.candidate.candidate) {
                handleCandidate(event.candidate.candidate);
            }
            else {
                handleCandidate(); // Pass nothing to tell that ICE-gathering-ended
            }
        };
        // create data channel
        if (!stream) {
            try {
                pc.createDataChannel('sctp', {});
            }
            catch (e) { }
        }
        // create an offer sdp
        if (DetectRTC.isPromisesSupported) {
            pc.createOffer().then(function (result) {
                pc.setLocalDescription(result).then(afterCreateOffer);
            });
        }
        else {
            pc.createOffer(function (result) {
                pc.setLocalDescription(result, afterCreateOffer, function () { });
            }, function () { });
        }
        function afterCreateOffer() {
            var lines = pc.localDescription.sdp.split('\n');
            lines.forEach(function (line) {
                if (line && line.indexOf('a=candidate:') === 0) {
                    handleCandidate(line);
                }
            });
        }
    }
    var MediaDevices = [];
    var audioInputDevices = [];
    var audioOutputDevices = [];
    var videoInputDevices = [];
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        // Firefox 38+ seems having support of enumerateDevices
        // Thanks @xdumaine/enumerateDevices
        navigator.enumerateDevices = function (callback) {
            var enumerateDevices = navigator.mediaDevices.enumerateDevices();
            if (enumerateDevices && enumerateDevices.then) {
                navigator.mediaDevices.enumerateDevices().then(callback).catch(function () {
                    callback([]);
                });
            }
            else {
                callback([]);
            }
        };
    }
    // Media Devices detection
    var canEnumerate = false;
    /*global MediaStreamTrack:true */
    if (typeof MediaStreamTrack !== 'undefined' && 'getSources' in MediaStreamTrack) {
        canEnumerate = true;
    }
    else if (navigator.mediaDevices && !!navigator.mediaDevices.enumerateDevices) {
        canEnumerate = true;
    }
    var hasMicrophone = false;
    var hasSpeakers = false;
    var hasWebcam = false;
    var isWebsiteHasMicrophonePermissions = false;
    var isWebsiteHasWebcamPermissions = false;
    // http://dev.w3.org/2011/webrtc/editor/getusermedia.html#mediadevices
    function checkDeviceSupport(callback) {
        if (!canEnumerate) {
            if (callback) {
                callback();
            }
            return;
        }
        if (!navigator.enumerateDevices && window.MediaStreamTrack && window.MediaStreamTrack.getSources) {
            navigator.enumerateDevices = window.MediaStreamTrack.getSources.bind(window.MediaStreamTrack);
        }
        if (!navigator.enumerateDevices && navigator.enumerateDevices) {
            navigator.enumerateDevices = navigator.enumerateDevices.bind(navigator);
        }
        if (!navigator.enumerateDevices) {
            if (callback) {
                callback();
            }
            return;
        }
        MediaDevices = [];
        audioInputDevices = [];
        audioOutputDevices = [];
        videoInputDevices = [];
        hasMicrophone = false;
        hasSpeakers = false;
        hasWebcam = false;
        isWebsiteHasMicrophonePermissions = false;
        isWebsiteHasWebcamPermissions = false;
        // to prevent duplication
        var alreadyUsedDevices = {};
        navigator.enumerateDevices(function (devices) {
            MediaDevices = [];
            audioInputDevices = [];
            audioOutputDevices = [];
            videoInputDevices = [];
            devices.forEach(function (_device) {
                var device = {};
                for (var d in _device) {
                    try {
                        if (typeof _device[d] !== 'function') {
                            device[d] = _device[d];
                        }
                    }
                    catch (e) { }
                }
                if (alreadyUsedDevices[device.deviceId + device.label + device.kind]) {
                    return;
                }
                // if it is MediaStreamTrack.getSources
                if (device.kind === 'audio') {
                    device.kind = 'audioinput';
                }
                if (device.kind === 'video') {
                    device.kind = 'videoinput';
                }
                if (!device.deviceId) {
                    device.deviceId = device.id;
                }
                if (!device.id) {
                    device.id = device.deviceId;
                }
                if (!device.label) {
                    device.isCustomLabel = true;
                    if (device.kind === 'videoinput') {
                        device.label = 'Camera ' + (videoInputDevices.length + 1);
                    }
                    else if (device.kind === 'audioinput') {
                        device.label = 'Microphone ' + (audioInputDevices.length + 1);
                    }
                    else if (device.kind === 'audiooutput') {
                        device.label = 'Speaker ' + (audioOutputDevices.length + 1);
                    }
                    else {
                        device.label = 'Please invoke getUserMedia once.';
                    }
                    if (typeof DetectRTC !== 'undefined' && DetectRTC.browser.isChrome && DetectRTC.browser.version >= 46 && !/^(https:|chrome-extension:)$/g.test(location.protocol || '')) {
                        if (typeof document !== 'undefined' && typeof document.domain === 'string' && document.domain.search && document.domain.search(/localhost|127.0./g) === -1) {
                            device.label = 'HTTPs is required to get label of this ' + device.kind + ' device.';
                        }
                    }
                }
                else {
                    // Firefox on Android still returns empty label
                    if (device.kind === 'videoinput' && !isWebsiteHasWebcamPermissions) {
                        isWebsiteHasWebcamPermissions = true;
                    }
                    if (device.kind === 'audioinput' && !isWebsiteHasMicrophonePermissions) {
                        isWebsiteHasMicrophonePermissions = true;
                    }
                }
                if (device.kind === 'audioinput') {
                    hasMicrophone = true;
                    if (audioInputDevices.indexOf(device) === -1) {
                        audioInputDevices.push(device);
                    }
                }
                if (device.kind === 'audiooutput') {
                    hasSpeakers = true;
                    if (audioOutputDevices.indexOf(device) === -1) {
                        audioOutputDevices.push(device);
                    }
                }
                if (device.kind === 'videoinput') {
                    hasWebcam = true;
                    if (videoInputDevices.indexOf(device) === -1) {
                        videoInputDevices.push(device);
                    }
                }
                // there is no 'videoouput' in the spec.
                MediaDevices.push(device);
                alreadyUsedDevices[device.deviceId + device.label + device.kind] = device;
            });
            if (typeof DetectRTC !== 'undefined') {
                // to sync latest outputs
                DetectRTC.MediaDevices = MediaDevices;
                DetectRTC.hasMicrophone = hasMicrophone;
                DetectRTC.hasSpeakers = hasSpeakers;
                DetectRTC.hasWebcam = hasWebcam;
                DetectRTC.isWebsiteHasWebcamPermissions = isWebsiteHasWebcamPermissions;
                DetectRTC.isWebsiteHasMicrophonePermissions = isWebsiteHasMicrophonePermissions;
                DetectRTC.audioInputDevices = audioInputDevices;
                DetectRTC.audioOutputDevices = audioOutputDevices;
                DetectRTC.videoInputDevices = videoInputDevices;
            }
            if (callback) {
                callback();
            }
        });
    }
    var DetectRTC = window.DetectRTC || {};
    // ----------
    // DetectRTC.browser.name || DetectRTC.browser.version || DetectRTC.browser.fullVersion
    DetectRTC.browser = getBrowserInfo();
    detectPrivateMode(function (isPrivateBrowsing) {
        DetectRTC.browser.isPrivateBrowsing = !!isPrivateBrowsing;
    });
    // DetectRTC.isChrome || DetectRTC.isFirefox || DetectRTC.isEdge
    DetectRTC.browser['is' + DetectRTC.browser.name] = true;
    // -----------
    DetectRTC.osName = osName;
    DetectRTC.osVersion = osVersion;
    var isNodeWebkit = typeof process === 'object' && typeof process.versions === 'object' && process.versions['node-webkit'];
    // --------- Detect if system supports WebRTC 1.0 or WebRTC 1.1.
    var isWebRTCSupported = false;
    ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection', 'RTCIceGatherer'].forEach(function (item) {
        if (isWebRTCSupported) {
            return;
        }
        if (item in window) {
            isWebRTCSupported = true;
        }
    });
    DetectRTC.isWebRTCSupported = isWebRTCSupported;
    //-------
    DetectRTC.isORTCSupported = typeof RTCIceGatherer !== 'undefined';
    // --------- Detect if system supports screen capturing API
    var isScreenCapturingSupported = false;
    if (DetectRTC.browser.isChrome && DetectRTC.browser.version >= 35) {
        isScreenCapturingSupported = true;
    }
    else if (DetectRTC.browser.isFirefox && DetectRTC.browser.version >= 34) {
        isScreenCapturingSupported = true;
    }
    else if (DetectRTC.browser.isEdge && DetectRTC.browser.version >= 17) {
        isScreenCapturingSupported = true;
    }
    else if (DetectRTC.osName === 'Android' && DetectRTC.browser.isChrome) {
        isScreenCapturingSupported = true;
    }
    if (!!navigator.getDisplayMedia || (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) {
        isScreenCapturingSupported = true;
    }
    if (!/^(https:|chrome-extension:)$/g.test(location.protocol || '')) {
        var isNonLocalHost = typeof document !== 'undefined' && typeof document.domain === 'string' && document.domain.search && document.domain.search(/localhost|127.0./g) === -1;
        if (isNonLocalHost && (DetectRTC.browser.isChrome || DetectRTC.browser.isEdge || DetectRTC.browser.isOpera)) {
            isScreenCapturingSupported = false;
        }
        else if (DetectRTC.browser.isFirefox) {
            isScreenCapturingSupported = false;
        }
    }
    DetectRTC.isScreenCapturingSupported = isScreenCapturingSupported;
    // --------- Detect if WebAudio API are supported
    var webAudio = {
        isSupported: false,
        isCreateMediaStreamSourceSupported: false
    };
    ['AudioContext', 'webkitAudioContext', 'mozAudioContext', 'msAudioContext'].forEach(function (item) {
        if (webAudio.isSupported) {
            return;
        }
        if (item in window) {
            webAudio.isSupported = true;
            if (window[item] && 'createMediaStreamSource' in window[item].prototype) {
                webAudio.isCreateMediaStreamSourceSupported = true;
            }
        }
    });
    DetectRTC.isAudioContextSupported = webAudio.isSupported;
    DetectRTC.isCreateMediaStreamSourceSupported = webAudio.isCreateMediaStreamSourceSupported;
    // ---------- Detect if SCTP/RTP channels are supported.
    var isRtpDataChannelsSupported = false;
    if (DetectRTC.browser.isChrome && DetectRTC.browser.version > 31) {
        isRtpDataChannelsSupported = true;
    }
    DetectRTC.isRtpDataChannelsSupported = isRtpDataChannelsSupported;
    var isSCTPSupportd = false;
    if (DetectRTC.browser.isFirefox && DetectRTC.browser.version > 28) {
        isSCTPSupportd = true;
    }
    else if (DetectRTC.browser.isChrome && DetectRTC.browser.version > 25) {
        isSCTPSupportd = true;
    }
    else if (DetectRTC.browser.isOpera && DetectRTC.browser.version >= 11) {
        isSCTPSupportd = true;
    }
    DetectRTC.isSctpDataChannelsSupported = isSCTPSupportd;
    // ---------
    DetectRTC.isMobileDevice = isMobileDevice; // "isMobileDevice" boolean is defined in "getBrowserInfo.js"
    // ------
    var isGetUserMediaSupported = false;
    if (navigator.getUserMedia) {
        isGetUserMediaSupported = true;
    }
    else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        isGetUserMediaSupported = true;
    }
    if (DetectRTC.browser.isChrome && DetectRTC.browser.version >= 46 && !/^(https:|chrome-extension:)$/g.test(location.protocol || '')) {
        if (typeof document !== 'undefined' && typeof document.domain === 'string' && document.domain.search && document.domain.search(/localhost|127.0./g) === -1) {
            isGetUserMediaSupported = 'Requires HTTPs';
        }
    }
    if (DetectRTC.osName === 'Nodejs') {
        isGetUserMediaSupported = false;
    }
    DetectRTC.isGetUserMediaSupported = isGetUserMediaSupported;
    var displayResolution = '';
    if (screen.width) {
        var width = (screen.width) ? screen.width : '';
        var height = (screen.height) ? screen.height : '';
        displayResolution += '' + width + ' x ' + height;
    }
    DetectRTC.displayResolution = displayResolution;
    function getAspectRatio(w, h) {
        function gcd(a, b) {
            return (b == 0) ? a : gcd(b, a % b);
        }
        var r = gcd(w, h);
        return (w / r) / (h / r);
    }
    DetectRTC.displayAspectRatio = getAspectRatio(screen.width, screen.height).toFixed(2);
    // ----------
    DetectRTC.isCanvasSupportsStreamCapturing = isCanvasSupportsStreamCapturing;
    DetectRTC.isVideoSupportsStreamCapturing = isVideoSupportsStreamCapturing;
    if (DetectRTC.browser.name == 'Chrome' && DetectRTC.browser.version >= 53) {
        if (!DetectRTC.isCanvasSupportsStreamCapturing) {
            DetectRTC.isCanvasSupportsStreamCapturing = 'Requires chrome flag: enable-experimental-web-platform-features';
        }
        if (!DetectRTC.isVideoSupportsStreamCapturing) {
            DetectRTC.isVideoSupportsStreamCapturing = 'Requires chrome flag: enable-experimental-web-platform-features';
        }
    }
    // ------
    DetectRTC.DetectLocalIPAddress = DetectLocalIPAddress;
    DetectRTC.isWebSocketsSupported = 'WebSocket' in window && 2 === window.WebSocket.CLOSING;
    DetectRTC.isWebSocketsBlocked = !DetectRTC.isWebSocketsSupported;
    if (DetectRTC.osName === 'Nodejs') {
        DetectRTC.isWebSocketsSupported = true;
        DetectRTC.isWebSocketsBlocked = false;
    }
    DetectRTC.checkWebSocketsSupport = function (callback) {
        callback = callback || function () { };
        try {
            var starttime;
            var websocket = new WebSocket('wss://echo.websocket.org:443/');
            websocket.onopen = function () {
                DetectRTC.isWebSocketsBlocked = false;
                starttime = (new Date).getTime();
                websocket.send('ping');
            };
            websocket.onmessage = function () {
                DetectRTC.WebsocketLatency = (new Date).getTime() - starttime + 'ms';
                callback();
                websocket.close();
                websocket = null;
            };
            websocket.onerror = function () {
                DetectRTC.isWebSocketsBlocked = true;
                callback();
            };
        }
        catch (e) {
            DetectRTC.isWebSocketsBlocked = true;
            callback();
        }
    };
    // -------
    DetectRTC.load = function (callback) {
        callback = callback || function () { };
        checkDeviceSupport(callback);
    };
    // check for microphone/camera support!
    if (typeof checkDeviceSupport === 'function') {
        // checkDeviceSupport();
    }
    if (typeof MediaDevices !== 'undefined') {
        DetectRTC.MediaDevices = MediaDevices;
    }
    else {
        DetectRTC.MediaDevices = [];
    }
    DetectRTC.hasMicrophone = hasMicrophone;
    DetectRTC.hasSpeakers = hasSpeakers;
    DetectRTC.hasWebcam = hasWebcam;
    DetectRTC.isWebsiteHasWebcamPermissions = isWebsiteHasWebcamPermissions;
    DetectRTC.isWebsiteHasMicrophonePermissions = isWebsiteHasMicrophonePermissions;
    DetectRTC.audioInputDevices = audioInputDevices;
    DetectRTC.audioOutputDevices = audioOutputDevices;
    DetectRTC.videoInputDevices = videoInputDevices;
    // ------
    var isSetSinkIdSupported = false;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function' && 'setSinkId' in document.createElement('video')) {
        isSetSinkIdSupported = true;
    }
    DetectRTC.isSetSinkIdSupported = isSetSinkIdSupported;
    // -----
    var isRTPSenderReplaceTracksSupported = false;
    if (DetectRTC.browser.isFirefox && typeof mozRTCPeerConnection !== 'undefined' /*&& DetectRTC.browser.version > 39*/) {
        /*global mozRTCPeerConnection:true */
        if ('getSenders' in mozRTCPeerConnection.prototype) {
            isRTPSenderReplaceTracksSupported = true;
        }
    }
    else if (DetectRTC.browser.isChrome && typeof webkitRTCPeerConnection !== 'undefined') {
        /*global webkitRTCPeerConnection:true */
        if ('getSenders' in webkitRTCPeerConnection.prototype) {
            isRTPSenderReplaceTracksSupported = true;
        }
    }
    DetectRTC.isRTPSenderReplaceTracksSupported = isRTPSenderReplaceTracksSupported;
    //------
    var isRemoteStreamProcessingSupported = false;
    if (DetectRTC.browser.isFirefox && DetectRTC.browser.version > 38) {
        isRemoteStreamProcessingSupported = true;
    }
    DetectRTC.isRemoteStreamProcessingSupported = isRemoteStreamProcessingSupported;
    //-------
    var isApplyConstraintsSupported = false;
    /*global MediaStreamTrack:true */
    if (typeof MediaStreamTrack !== 'undefined' && 'applyConstraints' in MediaStreamTrack.prototype) {
        isApplyConstraintsSupported = true;
    }
    DetectRTC.isApplyConstraintsSupported = isApplyConstraintsSupported;
    //-------
    var isMultiMonitorScreenCapturingSupported = false;
    if (DetectRTC.browser.isFirefox && DetectRTC.browser.version >= 43) {
        // version 43 merely supports platforms for multi-monitors
        // version 44 will support exact multi-monitor selection i.e. you can select any monitor for screen capturing.
        isMultiMonitorScreenCapturingSupported = true;
    }
    DetectRTC.isMultiMonitorScreenCapturingSupported = isMultiMonitorScreenCapturingSupported;
    DetectRTC.isPromisesSupported = !!('Promise' in window);
    // version is generated by "grunt"
    DetectRTC.version = '1.4.1';
    if (typeof DetectRTC === 'undefined') {
        window.DetectRTC = {};
    }
    var MediaStream = window.MediaStream;
    if (typeof MediaStream === 'undefined' && typeof webkitMediaStream !== 'undefined') {
        MediaStream = webkitMediaStream;
    }
    if (typeof MediaStream !== 'undefined' && typeof MediaStream === 'function') {
        DetectRTC.MediaStream = Object.keys(MediaStream.prototype);
    }
    else
        DetectRTC.MediaStream = false;
    if (typeof MediaStreamTrack !== 'undefined') {
        DetectRTC.MediaStreamTrack = Object.keys(MediaStreamTrack.prototype);
    }
    else
        DetectRTC.MediaStreamTrack = false;
    var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    if (typeof RTCPeerConnection !== 'undefined') {
        DetectRTC.RTCPeerConnection = Object.keys(RTCPeerConnection.prototype);
    }
    else
        DetectRTC.RTCPeerConnection = false;
    window.DetectRTC = DetectRTC;
    if (typeof module !== 'undefined' /* && !!module.exports*/) {
        module.exports = DetectRTC;
    }
    if (typeof define === 'function' && define.amd) {
        define('DetectRTC', [], function () {
            return DetectRTC;
        });
    }
})();
// globals.js
if (typeof cordova !== 'undefined') {
    DetectRTC.isMobileDevice = true;
    DetectRTC.browser.name = 'Chrome';
}
if (navigator && navigator.userAgent && navigator.userAgent.indexOf('Crosswalk') !== -1) {
    DetectRTC.isMobileDevice = true;
    DetectRTC.browser.name = 'Chrome';
}
function fireEvent(obj, eventName, args) {
    if (typeof CustomEvent === 'undefined') {
        return;
    }
    var eventDetail = {
        arguments: args,
        __exposedProps__: args
    };
    var event = new CustomEvent(eventName, eventDetail);
    obj.dispatchEvent(event);
}
function setHarkEvents(connection, streamEvent) {
    if (!streamEvent.stream || !getTracks(streamEvent.stream, 'audio').length)
        return;
    if (!connection || !streamEvent) {
        throw 'Both arguments are required.';
    }
    if (!connection.onspeaking || !connection.onsilence) {
        return;
    }
    if (typeof hark === 'undefined') {
        throw 'hark.js not found.';
    }
    hark(streamEvent.stream, {
        onspeaking: function () {
            connection.onspeaking(streamEvent);
        },
        onsilence: function () {
            connection.onsilence(streamEvent);
        },
        onvolumechange: function (volume, threshold) {
            if (!connection.onvolumechange) {
                return;
            }
            connection.onvolumechange(merge({
                volume: volume,
                threshold: threshold
            }, streamEvent));
        }
    });
}
function setMuteHandlers(connection, streamEvent) {
    if (!streamEvent.stream || !streamEvent.stream || !streamEvent.stream.addEventListener)
        return;
    streamEvent.stream.addEventListener('mute', function (event) {
        event = connection.streamEvents[streamEvent.streamid];
        event.session = {
            audio: event.muteType === 'audio',
            video: event.muteType === 'video'
        };
        connection.onmute(event);
    }, false);
    streamEvent.stream.addEventListener('unmute', function (event) {
        event = connection.streamEvents[streamEvent.streamid];
        event.session = {
            audio: event.unmuteType === 'audio',
            video: event.unmuteType === 'video'
        };
        connection.onunmute(event);
    }, false);
}
function getRandomString() {
    if (window.crypto && window.crypto.getRandomValues && navigator.userAgent.indexOf('Safari') === -1) {
        var a = window.crypto.getRandomValues(new Uint32Array(3)), token = '';
        for (var i = 0, l = a.length; i < l; i++) {
            token += a[i].toString(36);
        }
        return token;
    }
    else {
        return (Math.random() * new Date().getTime()).toString(36).replace(/\./g, '');
    }
}
// Get HTMLAudioElement/HTMLVideoElement accordingly
// todo: add API documentation for connection.autoCreateMediaElement
function getRMCMediaElement(stream, callback, connection) {
    if (!connection.autoCreateMediaElement) {
        callback({});
        return;
    }
    var isAudioOnly = false;
    if (!getTracks(stream, 'video').length && !stream.isVideo && !stream.isScreen) {
        isAudioOnly = true;
    }
    if (DetectRTC.browser.name === 'Firefox') {
        if (connection.session.video || connection.session.screen) {
            isAudioOnly = false;
        }
    }
    var mediaElement = document.createElement(isAudioOnly ? 'audio' : 'video');
    mediaElement.srcObject = stream;
    mediaElement.setAttribute('autoplay', true);
    mediaElement.setAttribute('playsinline', true);
    mediaElement.setAttribute('controls', true);
    mediaElement.setAttribute('muted', false);
    mediaElement.setAttribute('volume', 1);
    // http://goo.gl/WZ5nFl
    // Firefox don't yet support onended for any stream (remote/local)
    if (DetectRTC.browser.name === 'Firefox') {
        var streamEndedEvent = 'ended';
        if ('oninactive' in mediaElement) {
            streamEndedEvent = 'inactive';
        }
        mediaElement.addEventListener(streamEndedEvent, function () {
            // fireEvent(stream, streamEndedEvent, stream);
            currentUserMediaRequest.remove(stream.idInstance);
            if (stream.type === 'local') {
                streamEndedEvent = 'ended';
                if ('oninactive' in stream) {
                    streamEndedEvent = 'inactive';
                }
                StreamsHandler.onSyncNeeded(stream.streamid, streamEndedEvent);
                connection.attachStreams.forEach(function (aStream, idx) {
                    if (stream.streamid === aStream.streamid) {
                        delete connection.attachStreams[idx];
                    }
                });
                var newStreamsArray = [];
                connection.attachStreams.forEach(function (aStream) {
                    if (aStream) {
                        newStreamsArray.push(aStream);
                    }
                });
                connection.attachStreams = newStreamsArray;
                var streamEvent = connection.streamEvents[stream.streamid];
                if (streamEvent) {
                    connection.onstreamended(streamEvent);
                    return;
                }
                if (this.parentNode) {
                    this.parentNode.removeChild(this);
                }
            }
        }, false);
    }
    var played = mediaElement.play();
    if (typeof played !== 'undefined') {
        var cbFired = false;
        setTimeout(function () {
            if (!cbFired) {
                cbFired = true;
                callback(mediaElement);
            }
        }, 1000);
        played.then(function () {
            if (cbFired)
                return;
            cbFired = true;
            callback(mediaElement);
        }).catch(function (error) {
            if (cbFired)
                return;
            cbFired = true;
            callback(mediaElement);
        });
    }
    else {
        callback(mediaElement);
    }
}
// if IE
if (!window.addEventListener) {
    window.addEventListener = function (el, eventName, eventHandler) {
        if (!el.attachEvent) {
            return;
        }
        el.attachEvent('on' + eventName, eventHandler);
    };
}
function listenEventHandler(eventName, eventHandler) {
    window.removeEventListener(eventName, eventHandler);
    window.addEventListener(eventName, eventHandler, false);
}
window.attachEventListener = function (video, type, listener, useCapture) {
    video.addEventListener(type, listener, useCapture);
};
function removeNullEntries(array) {
    var newArray = [];
    array.forEach(function (item) {
        if (item) {
            newArray.push(item);
        }
    });
    return newArray;
}
function isData(session) {
    return !session.audio && !session.video && !session.screen && session.data;
}
function isNull(obj) {
    return typeof obj === 'undefined';
}
function isString(obj) {
    return typeof obj === 'string';
}
var MediaStream = window.MediaStream;
if (typeof MediaStream === 'undefined' && typeof webkitMediaStream !== 'undefined') {
    MediaStream = webkitMediaStream;
}
/*global MediaStream:true */
if (typeof MediaStream !== 'undefined') {
    if (!('stop' in MediaStream.prototype)) {
        MediaStream.prototype.stop = function () {
            this.getTracks().forEach(function (track) {
                track.stop();
            });
        };
    }
}
function isAudioPlusTab(connection, audioPlusTab) {
    if (connection.session.audio && connection.session.audio === 'two-way') {
        return false;
    }
    if (DetectRTC.browser.name === 'Firefox' && audioPlusTab !== false) {
        return true;
    }
    if (DetectRTC.browser.name !== 'Chrome' || DetectRTC.browser.version < 50)
        return false;
    if (typeof audioPlusTab === true) {
        return true;
    }
    if (typeof audioPlusTab === 'undefined' && connection.session.audio && connection.session.screen && !connection.session.video) {
        audioPlusTab = true;
        return true;
    }
    return false;
}
function getAudioScreenConstraints(screen_constraints) {
    if (DetectRTC.browser.name === 'Firefox') {
        return true;
    }
    if (DetectRTC.browser.name !== 'Chrome')
        return false;
    return {
        mandatory: {
            chromeMediaSource: screen_constraints.mandatory.chromeMediaSource,
            chromeMediaSourceId: screen_constraints.mandatory.chromeMediaSourceId
        }
    };
}
window.iOSDefaultAudioOutputDevice = window.iOSDefaultAudioOutputDevice || 'speaker'; // earpiece or speaker
function getTracks(stream, kind) {
    if (!stream || !stream.getTracks) {
        return [];
    }
    return stream.getTracks().filter(function (t) {
        return t.kind === (kind || 'audio');
    });
}
function isUnifiedPlanSupportedDefault() {
    var canAddTransceiver = false;
    try {
        if (typeof RTCRtpTransceiver === 'undefined')
            return false;
        if (!('currentDirection' in RTCRtpTransceiver.prototype))
            return false;
        var tempPc = new RTCPeerConnection();
        try {
            tempPc.addTransceiver('audio');
            canAddTransceiver = true;
        }
        catch (e) { }
        tempPc.close();
    }
    catch (e) {
        canAddTransceiver = false;
    }
    return canAddTransceiver && isUnifiedPlanSuppored();
}
function isUnifiedPlanSuppored() {
    var isUnifiedPlanSupported = false;
    try {
        var pc = new RTCPeerConnection({
            sdpSemantics: 'unified-plan'
        });
        try {
            var config = pc.getConfiguration();
            if (config.sdpSemantics == 'unified-plan')
                isUnifiedPlanSupported = true;
            else if (config.sdpSemantics == 'plan-b')
                isUnifiedPlanSupported = false;
            else
                isUnifiedPlanSupported = false;
        }
        catch (e) {
            isUnifiedPlanSupported = false;
        }
    }
    catch (e) {
        isUnifiedPlanSupported = false;
    }
    return isUnifiedPlanSupported;
}
// ios-hacks.js
function setCordovaAPIs() {
    // if (DetectRTC.osName !== 'iOS') return;
    if (typeof cordova === 'undefined' || typeof cordova.plugins === 'undefined' || typeof cordova.plugins.iosrtc === 'undefined')
        return;
    var iosrtc = cordova.plugins.iosrtc;
    window.webkitRTCPeerConnection = iosrtc.RTCPeerConnection;
    window.RTCSessionDescription = iosrtc.RTCSessionDescription;
    window.RTCIceCandidate = iosrtc.RTCIceCandidate;
    window.MediaStream = iosrtc.MediaStream;
    window.MediaStreamTrack = iosrtc.MediaStreamTrack;
    navigator.getUserMedia = navigator.webkitGetUserMedia = iosrtc.getUserMedia;
    iosrtc.debug.enable('iosrtc*');
    if (typeof iosrtc.selectAudioOutput == 'function') {
        iosrtc.selectAudioOutput(window.iOSDefaultAudioOutputDevice || 'speaker'); // earpiece or speaker
    }
    iosrtc.registerGlobals();
}
document.addEventListener('deviceready', setCordovaAPIs, false);
setCordovaAPIs();
// RTCPeerConnection.js
var defaults = {};
function setSdpConstraints(config) {
    var sdpConstraints = {
        OfferToReceiveAudio: !!config.OfferToReceiveAudio,
        OfferToReceiveVideo: !!config.OfferToReceiveVideo
    };
    return sdpConstraints;
}
var RTCPeerConnection;
if (typeof window.RTCPeerConnection !== 'undefined') {
    RTCPeerConnection = window.RTCPeerConnection;
}
else if (typeof mozRTCPeerConnection !== 'undefined') {
    RTCPeerConnection = mozRTCPeerConnection;
}
else if (typeof webkitRTCPeerConnection !== 'undefined') {
    RTCPeerConnection = webkitRTCPeerConnection;
}
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;
var MediaStreamTrack = window.MediaStreamTrack;
function PeerInitiator(config) {
    if (typeof window.RTCPeerConnection !== 'undefined') {
        RTCPeerConnection = window.RTCPeerConnection;
    }
    else if (typeof mozRTCPeerConnection !== 'undefined') {
        RTCPeerConnection = mozRTCPeerConnection;
    }
    else if (typeof webkitRTCPeerConnection !== 'undefined') {
        RTCPeerConnection = webkitRTCPeerConnection;
    }
    RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
    RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;
    MediaStreamTrack = window.MediaStreamTrack;
    if (!RTCPeerConnection) {
        throw 'WebRTC 1.0 (RTCPeerConnection) API are NOT available in this browser.';
    }
    var connection = config.rtcMultiConnection;
    this.extra = config.remoteSdp ? config.remoteSdp.extra : connection.extra;
    this.userid = config.userid;
    this.streams = [];
    this.channels = config.channels || [];
    this.connectionDescription = config.connectionDescription;
    this.addStream = function (session) {
        connection.addStream(session, self.userid);
    };
    this.removeStream = function (streamid) {
        connection.removeStream(streamid, self.userid);
    };
    var self = this;
    if (config.remoteSdp) {
        this.connectionDescription = config.remoteSdp.connectionDescription;
    }
    var allRemoteStreams = {};
    defaults.sdpConstraints = setSdpConstraints({
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: true
    });
    var peer;
    var renegotiatingPeer = !!config.renegotiatingPeer;
    if (config.remoteSdp) {
        renegotiatingPeer = !!config.remoteSdp.renegotiatingPeer;
    }
    var localStreams = [];
    connection.attachStreams.forEach(function (stream) {
        if (!!stream) {
            localStreams.push(stream);
        }
    });
    if (!renegotiatingPeer) {
        var iceTransports = 'all';
        if (connection.candidates.turn || connection.candidates.relay) {
            if (!connection.candidates.stun && !connection.candidates.reflexive && !connection.candidates.host) {
                iceTransports = 'relay';
            }
        }
        try {
            // ref: developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration
            var params = {
                iceServers: connection.iceServers,
                iceTransportPolicy: connection.iceTransportPolicy || iceTransports
            };
            if (typeof connection.iceCandidatePoolSize !== 'undefined') {
                params.iceCandidatePoolSize = connection.iceCandidatePoolSize;
            }
            if (typeof connection.bundlePolicy !== 'undefined') {
                params.bundlePolicy = connection.bundlePolicy;
            }
            if (typeof connection.rtcpMuxPolicy !== 'undefined') {
                params.rtcpMuxPolicy = connection.rtcpMuxPolicy;
            }
            if (!!connection.sdpSemantics) {
                params.sdpSemantics = connection.sdpSemantics || 'unified-plan';
            }
            if (!connection.iceServers || !connection.iceServers.length) {
                params = null;
                connection.optionalArgument = null;
            }
            peer = new RTCPeerConnection(params, connection.optionalArgument);
        }
        catch (e) {
            try {
                var params = {
                    iceServers: connection.iceServers
                };
                peer = new RTCPeerConnection(params);
            }
            catch (e) {
                peer = new RTCPeerConnection();
            }
        }
    }
    else {
        peer = config.peerRef;
    }
    if (!peer.getRemoteStreams && peer.getReceivers) {
        peer.getRemoteStreams = function () {
            var stream = new MediaStream();
            peer.getReceivers().forEach(function (receiver) {
                stream.addTrack(receiver.track);
            });
            return [stream];
        };
    }
    if (!peer.getLocalStreams && peer.getSenders) {
        peer.getLocalStreams = function () {
            var stream = new MediaStream();
            peer.getSenders().forEach(function (sender) {
                stream.addTrack(sender.track);
            });
            return [stream];
        };
    }
    peer.onicecandidate = function (event) {
        if (!event.candidate) {
            if (!connection.trickleIce) {
                var localSdp = peer.localDescription;
                config.onLocalSdp({
                    type: localSdp.type,
                    sdp: localSdp.sdp,
                    remotePeerSdpConstraints: config.remotePeerSdpConstraints || false,
                    renegotiatingPeer: !!config.renegotiatingPeer || false,
                    connectionDescription: self.connectionDescription,
                    dontGetRemoteStream: !!config.dontGetRemoteStream,
                    extra: connection ? connection.extra : {},
                    streamsToShare: streamsToShare
                });
            }
            return;
        }
        if (!connection.trickleIce)
            return;
        config.onLocalCandidate({
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
        });
    };
    localStreams.forEach(function (localStream) {
        if (config.remoteSdp && config.remoteSdp.remotePeerSdpConstraints && config.remoteSdp.remotePeerSdpConstraints.dontGetRemoteStream) {
            return;
        }
        if (config.dontAttachLocalStream) {
            return;
        }
        localStream = connection.beforeAddingStream(localStream, self);
        if (!localStream)
            return;
        peer.getLocalStreams().forEach(function (stream) {
            if (localStream && stream.id == localStream.id) {
                localStream = null;
            }
        });
        if (localStream && localStream.getTracks) {
            localStream.getTracks().forEach(function (track) {
                try {
                    // last parameter is redundant for unified-plan
                    // starting from chrome version 72
                    peer.addTrack(track, localStream);
                }
                catch (e) { }
            });
        }
    });
    peer.oniceconnectionstatechange = peer.onsignalingstatechange = function () {
        var extra = self.extra;
        if (connection.peers[self.userid]) {
            extra = connection.peers[self.userid].extra || extra;
        }
        if (!peer) {
            return;
        }
        config.onPeerStateChanged({
            iceConnectionState: peer.iceConnectionState,
            iceGatheringState: peer.iceGatheringState,
            signalingState: peer.signalingState,
            extra: extra,
            userid: self.userid
        });
        if (peer && peer.iceConnectionState && peer.iceConnectionState.search(/closed|failed/gi) !== -1 && self.streams instanceof Array) {
            self.streams.forEach(function (stream) {
                var streamEvent = connection.streamEvents[stream.id] || {
                    streamid: stream.id,
                    stream: stream,
                    type: 'remote'
                };
                connection.onstreamended(streamEvent);
            });
        }
    };
    var sdpConstraints = {
        OfferToReceiveAudio: !!localStreams.length,
        OfferToReceiveVideo: !!localStreams.length
    };
    if (config.localPeerSdpConstraints)
        sdpConstraints = config.localPeerSdpConstraints;
    defaults.sdpConstraints = setSdpConstraints(sdpConstraints);
    var streamObject;
    var dontDuplicate = {};
    peer.ontrack = function (event) {
        if (!event || event.type !== 'track')
            return;
        event.stream = event.streams[event.streams.length - 1];
        if (!event.stream.id) {
            event.stream.id = event.track.id;
        }
        if (dontDuplicate[event.stream.id] && DetectRTC.browser.name !== 'Safari') {
            if (event.track) {
                event.track.onended = function () {
                    peer && peer.onremovestream(event);
                };
            }
            return;
        }
        dontDuplicate[event.stream.id] = event.stream.id;
        var streamsToShare = {};
        if (config.remoteSdp && config.remoteSdp.streamsToShare) {
            streamsToShare = config.remoteSdp.streamsToShare;
        }
        else if (config.streamsToShare) {
            streamsToShare = config.streamsToShare;
        }
        var streamToShare = streamsToShare[event.stream.id];
        if (streamToShare) {
            event.stream.isAudio = streamToShare.isAudio;
            event.stream.isVideo = streamToShare.isVideo;
            event.stream.isScreen = streamToShare.isScreen;
        }
        else {
            event.stream.isVideo = !!getTracks(event.stream, 'video').length;
            event.stream.isAudio = !event.stream.isVideo;
            event.stream.isScreen = false;
        }
        event.stream.streamid = event.stream.id;
        allRemoteStreams[event.stream.id] = event.stream;
        config.onRemoteStream(event.stream);
        event.stream.getTracks().forEach(function (track) {
            track.onended = function () {
                peer && peer.onremovestream(event);
            };
        });
        event.stream.onremovetrack = function () {
            peer && peer.onremovestream(event);
        };
    };
    peer.onremovestream = function (event) {
        // this event doesn't works anymore
        event.stream.streamid = event.stream.id;
        if (allRemoteStreams[event.stream.id]) {
            delete allRemoteStreams[event.stream.id];
        }
        config.onRemoteStreamRemoved(event.stream);
    };
    if (typeof peer.removeStream !== 'function') {
        // removeStream backward compatibility
        peer.removeStream = function (stream) {
            stream.getTracks().forEach(function (track) {
                peer.removeTrack(track, stream);
            });
        };
    }
    this.addRemoteCandidate = function (remoteCandidate) {
        peer.addIceCandidate(new RTCIceCandidate(remoteCandidate));
    };
    function oldAddRemoteSdp(remoteSdp, cb) {
        cb = cb || function () { };
        if (DetectRTC.browser.name !== 'Safari') {
            remoteSdp.sdp = connection.processSdp(remoteSdp.sdp);
        }
        peer.setRemoteDescription(new RTCSessionDescription(remoteSdp), cb, function (error) {
            if (!!connection.enableLogs) {
                console.error('setRemoteDescription failed', '\n', error, '\n', remoteSdp.sdp);
            }
            cb();
        });
    }
    this.addRemoteSdp = function (remoteSdp, cb) {
        cb = cb || function () { };
        if (DetectRTC.browser.name !== 'Safari') {
            remoteSdp.sdp = connection.processSdp(remoteSdp.sdp);
        }
        peer.setRemoteDescription(new RTCSessionDescription(remoteSdp)).then(cb, function (error) {
            if (!!connection.enableLogs) {
                console.error('setRemoteDescription failed', '\n', error, '\n', remoteSdp.sdp);
            }
            cb();
        }).catch(function (error) {
            if (!!connection.enableLogs) {
                console.error('setRemoteDescription failed', '\n', error, '\n', remoteSdp.sdp);
            }
            cb();
        });
    };
    var isOfferer = true;
    if (config.remoteSdp) {
        isOfferer = false;
    }
    this.createDataChannel = function () {
        var channel = peer.createDataChannel('sctp', {});
        setChannelEvents(channel);
    };
    if (connection.session.data === true && !renegotiatingPeer) {
        if (!isOfferer) {
            peer.ondatachannel = function (event) {
                var channel = event.channel;
                setChannelEvents(channel);
            };
        }
        else {
            this.createDataChannel();
        }
    }
    this.enableDisableVideoEncoding = function (enable) {
        var rtcp;
        peer.getSenders().forEach(function (sender) {
            if (!rtcp && sender.track.kind === 'video') {
                rtcp = sender;
            }
        });
        if (!rtcp || !rtcp.getParameters)
            return;
        var parameters = rtcp.getParameters();
        parameters.encodings[1] && (parameters.encodings[1].active = !!enable);
        parameters.encodings[2] && (parameters.encodings[2].active = !!enable);
        rtcp.setParameters(parameters);
    };
    if (config.remoteSdp) {
        if (config.remoteSdp.remotePeerSdpConstraints) {
            sdpConstraints = config.remoteSdp.remotePeerSdpConstraints;
        }
        defaults.sdpConstraints = setSdpConstraints(sdpConstraints);
        this.addRemoteSdp(config.remoteSdp, function () {
            createOfferOrAnswer('createAnswer');
        });
    }
    function setChannelEvents(channel) {
        // force ArrayBuffer in Firefox; which uses "Blob" by default.
        channel.binaryType = 'arraybuffer';
        channel.onmessage = function (event) {
            config.onDataChannelMessage(event.data);
        };
        channel.onopen = function () {
            config.onDataChannelOpened(channel);
        };
        channel.onerror = function (error) {
            config.onDataChannelError(error);
        };
        channel.onclose = function (event) {
            config.onDataChannelClosed(event);
        };
        channel.internalSend = channel.send;
        channel.send = function (data) {
            if (channel.readyState !== 'open') {
                return;
            }
            channel.internalSend(data);
        };
        peer.channel = channel;
    }
    if (connection.session.audio == 'two-way' || connection.session.video == 'two-way' || connection.session.screen == 'two-way') {
        defaults.sdpConstraints = setSdpConstraints({
            OfferToReceiveAudio: connection.session.audio == 'two-way' || (config.remoteSdp && config.remoteSdp.remotePeerSdpConstraints && config.remoteSdp.remotePeerSdpConstraints.OfferToReceiveAudio),
            OfferToReceiveVideo: connection.session.video == 'two-way' || connection.session.screen == 'two-way' || (config.remoteSdp && config.remoteSdp.remotePeerSdpConstraints && config.remoteSdp.remotePeerSdpConstraints.OfferToReceiveAudio)
        });
    }
    var streamsToShare = {};
    peer.getLocalStreams().forEach(function (stream) {
        streamsToShare[stream.streamid] = {
            isAudio: !!stream.isAudio,
            isVideo: !!stream.isVideo,
            isScreen: !!stream.isScreen
        };
    });
    function oldCreateOfferOrAnswer(_method) {
        peer[_method](function (localSdp) {
            if (DetectRTC.browser.name !== 'Safari') {
                localSdp.sdp = connection.processSdp(localSdp.sdp);
            }
            peer.setLocalDescription(localSdp, function () {
                if (!connection.trickleIce)
                    return;
                config.onLocalSdp({
                    type: localSdp.type,
                    sdp: localSdp.sdp,
                    remotePeerSdpConstraints: config.remotePeerSdpConstraints || false,
                    renegotiatingPeer: !!config.renegotiatingPeer || false,
                    connectionDescription: self.connectionDescription,
                    dontGetRemoteStream: !!config.dontGetRemoteStream,
                    extra: connection ? connection.extra : {},
                    streamsToShare: streamsToShare
                });
                connection.onSettingLocalDescription(self);
            }, function (error) {
                if (!!connection.enableLogs) {
                    console.error('setLocalDescription-error', error);
                }
            });
        }, function (error) {
            if (!!connection.enableLogs) {
                console.error('sdp-' + _method + '-error', error);
            }
        }, defaults.sdpConstraints);
    }
    function createOfferOrAnswer(_method) {
        peer[_method](defaults.sdpConstraints).then(function (localSdp) {
            if (DetectRTC.browser.name !== 'Safari') {
                localSdp.sdp = connection.processSdp(localSdp.sdp);
            }
            peer.setLocalDescription(localSdp).then(function () {
                if (!connection.trickleIce)
                    return;
                config.onLocalSdp({
                    type: localSdp.type,
                    sdp: localSdp.sdp,
                    remotePeerSdpConstraints: config.remotePeerSdpConstraints || false,
                    renegotiatingPeer: !!config.renegotiatingPeer || false,
                    connectionDescription: self.connectionDescription,
                    dontGetRemoteStream: !!config.dontGetRemoteStream,
                    extra: connection ? connection.extra : {},
                    streamsToShare: streamsToShare
                });
                connection.onSettingLocalDescription(self);
            }, function (error) {
                if (!connection.enableLogs)
                    return;
                console.error('setLocalDescription error', error);
            });
        }, function (error) {
            if (!!connection.enableLogs) {
                console.error('sdp-error', error);
            }
        });
    }
    if (isOfferer) {
        createOfferOrAnswer('createOffer');
    }
    peer.nativeClose = peer.close;
    peer.close = function () {
        if (!peer) {
            return;
        }
        try {
            if (peer.nativeClose !== peer.close) {
                peer.nativeClose();
            }
        }
        catch (e) { }
        peer = null;
        self.peer = null;
    };
    this.peer = peer;
}
// CodecsHandler.js
var CodecsHandler = (function () {
    // use "RTCRtpTransceiver.setCodecPreferences"
    function preferCodec(sdp, codecName) {
        var info = splitLines(sdp);
        if (!info.videoCodecNumbers) {
            return sdp;
        }
        if (codecName === 'vp8' && info.vp8LineNumber === info.videoCodecNumbers[0]) {
            return sdp;
        }
        if (codecName === 'vp9' && info.vp9LineNumber === info.videoCodecNumbers[0]) {
            return sdp;
        }
        if (codecName === 'h264' && info.h264LineNumber === info.videoCodecNumbers[0]) {
            return sdp;
        }
        sdp = preferCodecHelper(sdp, codecName, info);
        return sdp;
    }
    function preferCodecHelper(sdp, codec, info, ignore) {
        var preferCodecNumber = '';
        if (codec === 'vp8') {
            if (!info.vp8LineNumber) {
                return sdp;
            }
            preferCodecNumber = info.vp8LineNumber;
        }
        if (codec === 'vp9') {
            if (!info.vp9LineNumber) {
                return sdp;
            }
            preferCodecNumber = info.vp9LineNumber;
        }
        if (codec === 'h264') {
            if (!info.h264LineNumber) {
                return sdp;
            }
            preferCodecNumber = info.h264LineNumber;
        }
        var newLine = info.videoCodecNumbersOriginal.split('SAVPF')[0] + 'SAVPF ';
        var newOrder = [preferCodecNumber];
        if (ignore) {
            newOrder = [];
        }
        info.videoCodecNumbers.forEach(function (codecNumber) {
            if (codecNumber === preferCodecNumber)
                return;
            newOrder.push(codecNumber);
        });
        newLine += newOrder.join(' ');
        sdp = sdp.replace(info.videoCodecNumbersOriginal, newLine);
        return sdp;
    }
    function splitLines(sdp) {
        var info = {};
        sdp.split('\n').forEach(function (line) {
            if (line.indexOf('m=video') === 0) {
                info.videoCodecNumbers = [];
                line.split('SAVPF')[1].split(' ').forEach(function (codecNumber) {
                    codecNumber = codecNumber.trim();
                    if (!codecNumber || !codecNumber.length)
                        return;
                    info.videoCodecNumbers.push(codecNumber);
                    info.videoCodecNumbersOriginal = line;
                });
            }
            if (line.indexOf('VP8/90000') !== -1 && !info.vp8LineNumber) {
                info.vp8LineNumber = line.replace('a=rtpmap:', '').split(' ')[0];
            }
            if (line.indexOf('VP9/90000') !== -1 && !info.vp9LineNumber) {
                info.vp9LineNumber = line.replace('a=rtpmap:', '').split(' ')[0];
            }
            if (line.indexOf('H264/90000') !== -1 && !info.h264LineNumber) {
                info.h264LineNumber = line.replace('a=rtpmap:', '').split(' ')[0];
            }
        });
        return info;
    }
    function removeVPX(sdp) {
        var info = splitLines(sdp);
        // last parameter below means: ignore these codecs
        sdp = preferCodecHelper(sdp, 'vp9', info, true);
        sdp = preferCodecHelper(sdp, 'vp8', info, true);
        return sdp;
    }
    function disableNACK(sdp) {
        if (!sdp || typeof sdp !== 'string') {
            throw 'Invalid arguments.';
        }
        sdp = sdp.replace('a=rtcp-fb:126 nack\r\n', '');
        sdp = sdp.replace('a=rtcp-fb:126 nack pli\r\n', 'a=rtcp-fb:126 pli\r\n');
        sdp = sdp.replace('a=rtcp-fb:97 nack\r\n', '');
        sdp = sdp.replace('a=rtcp-fb:97 nack pli\r\n', 'a=rtcp-fb:97 pli\r\n');
        return sdp;
    }
    function prioritize(codecMimeType, peer) {
        if (!peer || !peer.getSenders || !peer.getSenders().length) {
            return;
        }
        if (!codecMimeType || typeof codecMimeType !== 'string') {
            throw 'Invalid arguments.';
        }
        peer.getSenders().forEach(function (sender) {
            var params = sender.getParameters();
            for (var i = 0; i < params.codecs.length; i++) {
                if (params.codecs[i].mimeType == codecMimeType) {
                    params.codecs.unshift(params.codecs.splice(i, 1));
                    break;
                }
            }
            sender.setParameters(params);
        });
    }
    function removeNonG722(sdp) {
        return sdp.replace(/m=audio ([0-9]+) RTP\/SAVPF ([0-9 ]*)/g, 'm=audio $1 RTP\/SAVPF 9');
    }
    function setBAS(sdp, bandwidth, isScreen) {
        if (!bandwidth) {
            return sdp;
        }
        if (typeof isFirefox !== 'undefined' && isFirefox) {
            return sdp;
        }
        if (isScreen) {
            if (!bandwidth.screen) {
                console.warn('It seems that you are not using bandwidth for screen. Screen sharing is expected to fail.');
            }
            else if (bandwidth.screen < 300) {
                console.warn('It seems that you are using wrong bandwidth value for screen. Screen sharing is expected to fail.');
            }
        }
        // if screen; must use at least 300kbs
        if (bandwidth.screen && isScreen) {
            sdp = sdp.replace(/b=AS([^\r\n]+\r\n)/g, '');
            sdp = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:' + bandwidth.screen + '\r\n');
        }
        // remove existing bandwidth lines
        if (bandwidth.audio || bandwidth.video) {
            sdp = sdp.replace(/b=AS([^\r\n]+\r\n)/g, '');
        }
        if (bandwidth.audio) {
            sdp = sdp.replace(/a=mid:audio\r\n/g, 'a=mid:audio\r\nb=AS:' + bandwidth.audio + '\r\n');
        }
        if (bandwidth.screen) {
            sdp = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:' + bandwidth.screen + '\r\n');
        }
        else if (bandwidth.video) {
            sdp = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:' + bandwidth.video + '\r\n');
        }
        return sdp;
    }
    // Find the line in sdpLines that starts with |prefix|, and, if specified,
    // contains |substr| (case-insensitive search).
    function findLine(sdpLines, prefix, substr) {
        return findLineInRange(sdpLines, 0, -1, prefix, substr);
    }
    // Find the line in sdpLines[startLine...endLine - 1] that starts with |prefix|
    // and, if specified, contains |substr| (case-insensitive search).
    function findLineInRange(sdpLines, startLine, endLine, prefix, substr) {
        var realEndLine = endLine !== -1 ? endLine : sdpLines.length;
        for (var i = startLine; i < realEndLine; ++i) {
            if (sdpLines[i].indexOf(prefix) === 0) {
                if (!substr ||
                    sdpLines[i].toLowerCase().indexOf(substr.toLowerCase()) !== -1) {
                    return i;
                }
            }
        }
        return null;
    }
    // Gets the codec payload type from an a=rtpmap:X line.
    function getCodecPayloadType(sdpLine) {
        var pattern = new RegExp('a=rtpmap:(\\d+) \\w+\\/\\d+');
        var result = sdpLine.match(pattern);
        return (result && result.length === 2) ? result[1] : null;
    }
    function setVideoBitrates(sdp, params) {
        params = params || {};
        var xgoogle_min_bitrate = params.min;
        var xgoogle_max_bitrate = params.max;
        var sdpLines = sdp.split('\r\n');
        // VP8
        var vp8Index = findLine(sdpLines, 'a=rtpmap', 'VP8/90000');
        var vp8Payload;
        if (vp8Index) {
            vp8Payload = getCodecPayloadType(sdpLines[vp8Index]);
        }
        if (!vp8Payload) {
            return sdp;
        }
        var rtxIndex = findLine(sdpLines, 'a=rtpmap', 'rtx/90000');
        var rtxPayload;
        if (rtxIndex) {
            rtxPayload = getCodecPayloadType(sdpLines[rtxIndex]);
        }
        if (!rtxIndex) {
            return sdp;
        }
        var rtxFmtpLineIndex = findLine(sdpLines, 'a=fmtp:' + rtxPayload.toString());
        if (rtxFmtpLineIndex !== null) {
            var appendrtxNext = '\r\n';
            appendrtxNext += 'a=fmtp:' + vp8Payload + ' x-google-min-bitrate=' + (xgoogle_min_bitrate || '228') + '; x-google-max-bitrate=' + (xgoogle_max_bitrate || '228');
            sdpLines[rtxFmtpLineIndex] = sdpLines[rtxFmtpLineIndex].concat(appendrtxNext);
            sdp = sdpLines.join('\r\n');
        }
        return sdp;
    }
    function setOpusAttributes(sdp, params) {
        params = params || {};
        var sdpLines = sdp.split('\r\n');
        // Opus
        var opusIndex = findLine(sdpLines, 'a=rtpmap', 'opus/48000');
        var opusPayload;
        if (opusIndex) {
            opusPayload = getCodecPayloadType(sdpLines[opusIndex]);
        }
        if (!opusPayload) {
            return sdp;
        }
        var opusFmtpLineIndex = findLine(sdpLines, 'a=fmtp:' + opusPayload.toString());
        if (opusFmtpLineIndex === null) {
            return sdp;
        }
        var appendOpusNext = '';
        appendOpusNext += '; stereo=' + (typeof params.stereo != 'undefined' ? params.stereo : '1');
        appendOpusNext += '; sprop-stereo=' + (typeof params['sprop-stereo'] != 'undefined' ? params['sprop-stereo'] : '1');
        if (typeof params.maxaveragebitrate != 'undefined') {
            appendOpusNext += '; maxaveragebitrate=' + (params.maxaveragebitrate || 128 * 1024 * 8);
        }
        if (typeof params.maxplaybackrate != 'undefined') {
            appendOpusNext += '; maxplaybackrate=' + (params.maxplaybackrate || 128 * 1024 * 8);
        }
        if (typeof params.cbr != 'undefined') {
            appendOpusNext += '; cbr=' + (typeof params.cbr != 'undefined' ? params.cbr : '1');
        }
        if (typeof params.useinbandfec != 'undefined') {
            appendOpusNext += '; useinbandfec=' + params.useinbandfec;
        }
        if (typeof params.usedtx != 'undefined') {
            appendOpusNext += '; usedtx=' + params.usedtx;
        }
        if (typeof params.maxptime != 'undefined') {
            appendOpusNext += '\r\na=maxptime:' + params.maxptime;
        }
        sdpLines[opusFmtpLineIndex] = sdpLines[opusFmtpLineIndex].concat(appendOpusNext);
        sdp = sdpLines.join('\r\n');
        return sdp;
    }
    // forceStereoAudio => via webrtcexample.com
    // requires getUserMedia => echoCancellation:false
    function forceStereoAudio(sdp) {
        var sdpLines = sdp.split('\r\n');
        var fmtpLineIndex = null;
        for (var i = 0; i < sdpLines.length; i++) {
            if (sdpLines[i].search('opus/48000') !== -1) {
                var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
                break;
            }
        }
        for (var i = 0; i < sdpLines.length; i++) {
            if (sdpLines[i].search('a=fmtp') !== -1) {
                var payload = extractSdp(sdpLines[i], /a=fmtp:(\d+)/);
                if (payload === opusPayload) {
                    fmtpLineIndex = i;
                    break;
                }
            }
        }
        if (fmtpLineIndex === null)
            return sdp;
        sdpLines[fmtpLineIndex] = sdpLines[fmtpLineIndex].concat('; stereo=1; sprop-stereo=1');
        sdp = sdpLines.join('\r\n');
        return sdp;
    }
    return {
        removeVPX: removeVPX,
        disableNACK: disableNACK,
        prioritize: prioritize,
        removeNonG722: removeNonG722,
        setApplicationSpecificBandwidth: function (sdp, bandwidth, isScreen) {
            return setBAS(sdp, bandwidth, isScreen);
        },
        setVideoBitrates: function (sdp, params) {
            return setVideoBitrates(sdp, params);
        },
        setOpusAttributes: function (sdp, params) {
            return setOpusAttributes(sdp, params);
        },
        preferVP9: function (sdp) {
            return preferCodec(sdp, 'vp9');
        },
        preferCodec: preferCodec,
        forceStereoAudio: forceStereoAudio
    };
})();
// backward compatibility
window.BandwidthHandler = CodecsHandler;
// OnIceCandidateHandler.js
var OnIceCandidateHandler = (function () {
    function processCandidates(connection, icePair) {
        var candidate = icePair.candidate;
        var iceRestrictions = connection.candidates;
        var stun = iceRestrictions.stun;
        var turn = iceRestrictions.turn;
        if (!isNull(iceRestrictions.reflexive)) {
            stun = iceRestrictions.reflexive;
        }
        if (!isNull(iceRestrictions.relay)) {
            turn = iceRestrictions.relay;
        }
        if (!iceRestrictions.host && !!candidate.match(/typ host/g)) {
            return;
        }
        if (!turn && !!candidate.match(/typ relay/g)) {
            return;
        }
        if (!stun && !!candidate.match(/typ srflx/g)) {
            return;
        }
        var protocol = connection.iceProtocols;
        if (!protocol.udp && !!candidate.match(/ udp /g)) {
            return;
        }
        if (!protocol.tcp && !!candidate.match(/ tcp /g)) {
            return;
        }
        if (connection.enableLogs) {
            console.debug('Your candidate pairs:', candidate);
        }
        return {
            candidate: candidate,
            sdpMid: icePair.sdpMid,
            sdpMLineIndex: icePair.sdpMLineIndex
        };
    }
    return {
        processCandidates: processCandidates
    };
})();
// IceServersHandler.js
var IceServersHandler = (function () {
    function getIceServers(connection) {
        // resiprocate: 3344+4433
        // pions: 7575
        var iceServers = [{
                'urls': [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                    'stun:stun.l.google.com:19302?transport=udp',
                ]
            }];
        return iceServers;
    }
    return {
        getIceServers: getIceServers
    };
})();
// getUserMediaHandler.js
function setStreamType(constraints, stream) {
    if (constraints.mandatory && constraints.mandatory.chromeMediaSource) {
        stream.isScreen = true;
    }
    else if (constraints.mozMediaSource || constraints.mediaSource) {
        stream.isScreen = true;
    }
    else if (constraints.video) {
        stream.isVideo = true;
    }
    else if (constraints.audio) {
        stream.isAudio = true;
    }
}
// allow users to manage this object (to support re-capturing of screen/etc.)
window.currentUserMediaRequest = {
    streams: [],
    mutex: false,
    queueRequests: [],
    remove: function (idInstance) {
        this.mutex = false;
        var stream = this.streams[idInstance];
        if (!stream) {
            return;
        }
        stream = stream.stream;
        var options = stream.currentUserMediaRequestOptions;
        if (this.queueRequests.indexOf(options)) {
            delete this.queueRequests[this.queueRequests.indexOf(options)];
            this.queueRequests = removeNullEntries(this.queueRequests);
        }
        this.streams[idInstance].stream = null;
        delete this.streams[idInstance];
    }
};
function getUserMediaHandler(options) {
    if (currentUserMediaRequest.mutex === true) {
        currentUserMediaRequest.queueRequests.push(options);
        return;
    }
    currentUserMediaRequest.mutex = true;
    // easy way to match
    var idInstance = JSON.stringify(options.localMediaConstraints);
    function streaming(stream, returnBack) {
        setStreamType(options.localMediaConstraints, stream);
        var streamEndedEvent = 'ended';
        if ('oninactive' in stream) {
            streamEndedEvent = 'inactive';
        }
        stream.addEventListener(streamEndedEvent, function () {
            delete currentUserMediaRequest.streams[idInstance];
            currentUserMediaRequest.mutex = false;
            if (currentUserMediaRequest.queueRequests.indexOf(options)) {
                delete currentUserMediaRequest.queueRequests[currentUserMediaRequest.queueRequests.indexOf(options)];
                currentUserMediaRequest.queueRequests = removeNullEntries(currentUserMediaRequest.queueRequests);
            }
        }, false);
        currentUserMediaRequest.streams[idInstance] = {
            stream: stream
        };
        currentUserMediaRequest.mutex = false;
        if (currentUserMediaRequest.queueRequests.length) {
            getUserMediaHandler(currentUserMediaRequest.queueRequests.shift());
        }
        // callback
        options.onGettingLocalMedia(stream, returnBack);
    }
    if (currentUserMediaRequest.streams[idInstance]) {
        streaming(currentUserMediaRequest.streams[idInstance].stream, true);
    }
    else {
        var isBlackBerry = !!(/BB10|BlackBerry/i.test(navigator.userAgent || ''));
        if (isBlackBerry || typeof navigator.mediaDevices === 'undefined' || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            navigator.getUserMedia(options.localMediaConstraints, function (stream) {
                stream.streamid = stream.streamid || stream.id || getRandomString();
                stream.idInstance = idInstance;
                streaming(stream);
            }, function (error) {
                options.onLocalMediaError(error, options.localMediaConstraints);
            });
            return;
        }
        if (typeof navigator.mediaDevices === 'undefined') {
            navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            var getUserMediaSuccess = function () { };
            var getUserMediaFailure = function () { };
            var getUserMediaStream, getUserMediaError;
            navigator.mediaDevices = {
                getUserMedia: function (hints) {
                    navigator.getUserMedia(hints, function (getUserMediaSuccess) {
                        getUserMediaSuccess(stream);
                        getUserMediaStream = stream;
                    }, function (error) {
                        getUserMediaFailure(error);
                        getUserMediaError = error;
                    });
                    return {
                        then: function (successCB) {
                            if (getUserMediaStream) {
                                successCB(getUserMediaStream);
                                return;
                            }
                            getUserMediaSuccess = successCB;
                            return {
                                then: function (failureCB) {
                                    if (getUserMediaError) {
                                        failureCB(getUserMediaError);
                                        return;
                                    }
                                    getUserMediaFailure = failureCB;
                                }
                            };
                        }
                    };
                }
            };
        }
        if (options.localMediaConstraints.isScreen === true) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia(options.localMediaConstraints).then(function (stream) {
                    stream.streamid = stream.streamid || stream.id || getRandomString();
                    stream.idInstance = idInstance;
                    streaming(stream);
                }).catch(function (error) {
                    options.onLocalMediaError(error, options.localMediaConstraints);
                });
            }
            else if (navigator.getDisplayMedia) {
                navigator.getDisplayMedia(options.localMediaConstraints).then(function (stream) {
                    stream.streamid = stream.streamid || stream.id || getRandomString();
                    stream.idInstance = idInstance;
                    streaming(stream);
                }).catch(function (error) {
                    options.onLocalMediaError(error, options.localMediaConstraints);
                });
            }
            else {
                throw new Error('getDisplayMedia API is not availabe in this browser.');
            }
            return;
        }
        navigator.mediaDevices.getUserMedia(options.localMediaConstraints).then(function (stream) {
            stream.streamid = stream.streamid || stream.id || getRandomString();
            stream.idInstance = idInstance;
            streaming(stream);
        }).catch(function (error) {
            options.onLocalMediaError(error, options.localMediaConstraints);
        });
    }
}
// StreamsHandler.js
var StreamsHandler = (function () {
    function handleType(type) {
        if (!type) {
            return;
        }
        if (typeof type === 'string' || typeof type === 'undefined') {
            return type;
        }
        if (type.audio && type.video) {
            return null;
        }
        if (type.audio) {
            return 'audio';
        }
        if (type.video) {
            return 'video';
        }
        return;
    }
    function setHandlers(stream, syncAction, connection) {
        if (!stream || !stream.addEventListener)
            return;
        if (typeof syncAction == 'undefined' || syncAction == true) {
            var streamEndedEvent = 'ended';
            if ('oninactive' in stream) {
                streamEndedEvent = 'inactive';
            }
            stream.addEventListener(streamEndedEvent, function () {
                StreamsHandler.onSyncNeeded(this.streamid, streamEndedEvent);
            }, false);
        }
        stream.mute = function (type, isSyncAction) {
            type = handleType(type);
            if (typeof isSyncAction !== 'undefined') {
                syncAction = isSyncAction;
            }
            if (typeof type == 'undefined' || type == 'audio') {
                getTracks(stream, 'audio').forEach(function (track) {
                    track.enabled = false;
                    connection.streamEvents[stream.streamid].isAudioMuted = true;
                });
            }
            if (typeof type == 'undefined' || type == 'video') {
                getTracks(stream, 'video').forEach(function (track) {
                    track.enabled = false;
                });
            }
            if (typeof syncAction == 'undefined' || syncAction == true) {
                StreamsHandler.onSyncNeeded(stream.streamid, 'mute', type);
            }
            connection.streamEvents[stream.streamid].muteType = type || 'both';
            fireEvent(stream, 'mute', type);
        };
        stream.unmute = function (type, isSyncAction) {
            type = handleType(type);
            if (typeof isSyncAction !== 'undefined') {
                syncAction = isSyncAction;
            }
            graduallyIncreaseVolume();
            if (typeof type == 'undefined' || type == 'audio') {
                getTracks(stream, 'audio').forEach(function (track) {
                    track.enabled = true;
                    connection.streamEvents[stream.streamid].isAudioMuted = false;
                });
            }
            if (typeof type == 'undefined' || type == 'video') {
                getTracks(stream, 'video').forEach(function (track) {
                    track.enabled = true;
                });
                // make sure that video unmute doesn't affects audio
                if (typeof type !== 'undefined' && type == 'video' && connection.streamEvents[stream.streamid].isAudioMuted) {
                    (function looper(times) {
                        if (!times) {
                            times = 0;
                        }
                        times++;
                        // check until five-seconds
                        if (times < 100 && connection.streamEvents[stream.streamid].isAudioMuted) {
                            stream.mute('audio');
                            setTimeout(function () {
                                looper(times);
                            }, 50);
                        }
                    })();
                }
            }
            if (typeof syncAction == 'undefined' || syncAction == true) {
                StreamsHandler.onSyncNeeded(stream.streamid, 'unmute', type);
            }
            connection.streamEvents[stream.streamid].unmuteType = type || 'both';
            fireEvent(stream, 'unmute', type);
        };
        function graduallyIncreaseVolume() {
            if (!connection.streamEvents[stream.streamid].mediaElement) {
                return;
            }
            var mediaElement = connection.streamEvents[stream.streamid].mediaElement;
            mediaElement.volume = 0;
            afterEach(200, 5, function () {
                try {
                    mediaElement.volume += .20;
                }
                catch (e) {
                    mediaElement.volume = 1;
                }
            });
        }
    }
    function afterEach(setTimeoutInteval, numberOfTimes, callback, startedTimes) {
        startedTimes = (startedTimes || 0) + 1;
        if (startedTimes >= numberOfTimes)
            return;
        setTimeout(function () {
            callback();
            afterEach(setTimeoutInteval, numberOfTimes, callback, startedTimes);
        }, setTimeoutInteval);
    }
    return {
        setHandlers: setHandlers,
        onSyncNeeded: function (streamid, action, type) { }
    };
})();
// TextReceiver.js & TextSender.js
function TextReceiver(connection) {
    var content = {};
    function receive(data, userid, extra) {
        // uuid is used to uniquely identify sending instance
        var uuid = data.uuid;
        if (!content[uuid]) {
            content[uuid] = [];
        }
        content[uuid].push(data.message);
        if (data.last) {
            var message = content[uuid].join('');
            if (data.isobject) {
                message = JSON.parse(message);
            }
            // latency detection
            var receivingTime = new Date().getTime();
            var latency = receivingTime - data.sendingTime;
            var e = {
                data: message,
                userid: userid,
                extra: extra,
                latency: latency
            };
            if (connection.autoTranslateText) {
                e.original = e.data;
                connection.Translator.TranslateText(e.data, function (translatedText) {
                    e.data = translatedText;
                    connection.onmessage(e);
                });
            }
            else {
                connection.onmessage(e);
            }
            delete content[uuid];
        }
    }
    return {
        receive: receive
    };
}
// TextSender.js
var TextSender = {
    send: function (config) {
        var connection = config.connection;
        var channel = config.channel, remoteUserId = config.remoteUserId, initialText = config.text, packetSize = connection.chunkSize || 1000, textToTransfer = '', isobject = false;
        if (!isString(initialText)) {
            isobject = true;
            initialText = JSON.stringify(initialText);
        }
        // uuid is used to uniquely identify sending instance
        var uuid = getRandomString();
        var sendingTime = new Date().getTime();
        sendText(initialText);
        function sendText(textMessage, text) {
            var data = {
                type: 'text',
                uuid: uuid,
                sendingTime: sendingTime
            };
            if (textMessage) {
                text = textMessage;
                data.packets = parseInt(text.length / packetSize);
            }
            if (text.length > packetSize) {
                data.message = text.slice(0, packetSize);
            }
            else {
                data.message = text;
                data.last = true;
                data.isobject = isobject;
            }
            channel.send(data, remoteUserId);
            textToTransfer = text.slice(data.message.length);
            if (textToTransfer.length) {
                setTimeout(function () {
                    sendText(null, textToTransfer);
                }, connection.chunkInterval || 100);
            }
        }
    }
};
// FileProgressBarHandler.js
var FileProgressBarHandler = (function () {
    function handle(connection) {
        var progressHelper = {};
        // www.RTCMultiConnection.org/docs/onFileStart/
        connection.onFileStart = function (file) {
            var div = document.createElement('div');
            div.title = file.name;
            div.innerHTML = '<label>0%</label> <progress></progress>';
            if (file.remoteUserId) {
                div.innerHTML += ' (Sharing with:' + file.remoteUserId + ')';
            }
            if (!connection.filesContainer) {
                connection.filesContainer = document.body || document.documentElement;
            }
            connection.filesContainer.insertBefore(div, connection.filesContainer.firstChild);
            if (!file.remoteUserId) {
                progressHelper[file.uuid] = {
                    div: div,
                    progress: div.querySelector('progress'),
                    label: div.querySelector('label')
                };
                progressHelper[file.uuid].progress.max = file.maxChunks;
                return;
            }
            if (!progressHelper[file.uuid]) {
                progressHelper[file.uuid] = {};
            }
            progressHelper[file.uuid][file.remoteUserId] = {
                div: div,
                progress: div.querySelector('progress'),
                label: div.querySelector('label')
            };
            progressHelper[file.uuid][file.remoteUserId].progress.max = file.maxChunks;
        };
        // www.RTCMultiConnection.org/docs/onFileProgress/
        connection.onFileProgress = function (chunk) {
            var helper = progressHelper[chunk.uuid];
            if (!helper) {
                return;
            }
            if (chunk.remoteUserId) {
                helper = progressHelper[chunk.uuid][chunk.remoteUserId];
                if (!helper) {
                    return;
                }
            }
            helper.progress.value = chunk.currentPosition || chunk.maxChunks || helper.progress.max;
            updateLabel(helper.progress, helper.label);
        };
        // www.RTCMultiConnection.org/docs/onFileEnd/
        connection.onFileEnd = function (file) {
            var helper = progressHelper[file.uuid];
            if (!helper) {
                console.error('No such progress-helper element exist.', file);
                return;
            }
            if (file.remoteUserId) {
                helper = progressHelper[file.uuid][file.remoteUserId];
                if (!helper) {
                    return;
                }
            }
            var div = helper.div;
            if (file.type.indexOf('image') != -1) {
                div.innerHTML = '<a href="' + file.url + '" download="' + file.name + '">Download <strong style="color:red;">' + file.name + '</strong> </a><br /><img src="' + file.url + '" title="' + file.name + '" style="max-width: 80%;">';
            }
            else {
                div.innerHTML = '<a href="' + file.url + '" download="' + file.name + '">Download <strong style="color:red;">' + file.name + '</strong> </a><br /><iframe src="' + file.url + '" title="' + file.name + '" style="width: 80%;border: 0;height: inherit;margin-top:1em;"></iframe>';
            }
        };
        function updateLabel(progress, label) {
            if (progress.position === -1) {
                return;
            }
            var position = +progress.position.toFixed(2).split('.')[1] || 100;
            label.innerHTML = position + '%';
        }
    }
    return {
        handle: handle
    };
})();
// TranslationHandler.js
var TranslationHandler = (function () {
    function handle(connection) {
        connection.autoTranslateText = false;
        connection.language = 'en';
        connection.googKey = 'AIzaSyCgB5hmFY74WYB-EoWkhr9cAGr6TiTHrEE';
        // www.RTCMultiConnection.org/docs/Translator/
        connection.Translator = {
            TranslateText: function (text, callback) {
                // if(location.protocol === 'https:') return callback(text);
                var newScript = document.createElement('script');
                newScript.type = 'text/javascript';
                var sourceText = encodeURIComponent(text); // escape
                var randomNumber = 'method' + connection.token();
                window[randomNumber] = function (response) {
                    if (response.data && response.data.translations[0] && callback) {
                        callback(response.data.translations[0].translatedText);
                        return;
                    }
                    if (response.error && response.error.message === 'Daily Limit Exceeded') {
                        console.error('Text translation failed. Error message: "Daily Limit Exceeded."');
                        return;
                    }
                    if (response.error) {
                        console.error(response.error.message);
                        return;
                    }
                    console.error(response);
                };
                var source = 'https://www.googleapis.com/language/translate/v2?key=' + connection.googKey + '&target=' + (connection.language || 'en-US') + '&callback=window.' + randomNumber + '&q=' + sourceText;
                newScript.src = source;
                document.getElementsByTagName('head')[0].appendChild(newScript);
            },
            getListOfLanguages: function (callback) {
                var xhr = new XMLHttpRequest();
                xhr.onreadystatechange = function () {
                    if (xhr.readyState == XMLHttpRequest.DONE) {
                        var response = JSON.parse(xhr.responseText);
                        if (response && response.data && response.data.languages) {
                            callback(response.data.languages);
                            return;
                        }
                        if (response.error && response.error.message === 'Daily Limit Exceeded') {
                            console.error('Text translation failed. Error message: "Daily Limit Exceeded."');
                            return;
                        }
                        if (response.error) {
                            console.error(response.error.message);
                            return;
                        }
                        console.error(response);
                    }
                };
                var url = 'https://www.googleapis.com/language/translate/v2/languages?key=' + connection.googKey + '&target=en';
                xhr.open('GET', url, true);
                xhr.send(null);
            }
        };
    }
    return {
        handle: handle
    };
})();
// _____________________
// RTCMultiConnection.js
(function (connection) {
    forceOptions = forceOptions || {
        useDefaultDevices: true
    };
    connection.channel = connection.sessionid = (roomid || location.href.replace(/\/|:|#|\?|\$|\^|%|\.|`|~|!|\+|@|\[|\||]|\|*. /g, '').split('\n').join('').split('\r').join('')) + '';
    var mPeer = new MultiPeers(connection);
    var preventDuplicateOnStreamEvents = {};
    mPeer.onGettingLocalMedia = function (stream, callback) {
        callback = callback || function () { };
        if (preventDuplicateOnStreamEvents[stream.streamid]) {
            callback();
            return;
        }
        preventDuplicateOnStreamEvents[stream.streamid] = true;
        try {
            stream.type = 'local';
        }
        catch (e) { }
        connection.setStreamEndHandler(stream);
        getRMCMediaElement(stream, function (mediaElement) {
            mediaElement.id = stream.streamid;
            mediaElement.muted = true;
            mediaElement.volume = 0;
            if (connection.attachStreams.indexOf(stream) === -1) {
                connection.attachStreams.push(stream);
            }
            if (typeof StreamsHandler !== 'undefined') {
                StreamsHandler.setHandlers(stream, true, connection);
            }
            var isAudioMuted = stream.getAudioTracks().filter(function (track) {
                return track.enabled;
            }).length === 0;
            connection.streamEvents[stream.streamid] = {
                stream: stream,
                type: 'local',
                mediaElement: mediaElement,
                userid: connection.userid,
                extra: connection.extra,
                streamid: stream.streamid,
                isAudioMuted: isAudioMuted
            };
            try {
                setHarkEvents(connection, connection.streamEvents[stream.streamid]);
                setMuteHandlers(connection, connection.streamEvents[stream.streamid]);
                connection.onstream(connection.streamEvents[stream.streamid]);
            }
            catch (e) {
                //
            }
            callback();
        }, connection);
    };
    mPeer.onGettingRemoteMedia = function (stream, remoteUserId) {
        try {
            stream.type = 'remote';
        }
        catch (e) { }
        connection.setStreamEndHandler(stream, 'remote-stream');
        getRMCMediaElement(stream, function (mediaElement) {
            mediaElement.id = stream.streamid;
            if (typeof StreamsHandler !== 'undefined') {
                StreamsHandler.setHandlers(stream, false, connection);
            }
            connection.streamEvents[stream.streamid] = {
                stream: stream,
                type: 'remote',
                userid: remoteUserId,
                extra: connection.peers[remoteUserId] ? connection.peers[remoteUserId].extra : {},
                mediaElement: mediaElement,
                streamid: stream.streamid
            };
            setMuteHandlers(connection, connection.streamEvents[stream.streamid]);
            connection.onstream(connection.streamEvents[stream.streamid]);
        }, connection);
    };
    mPeer.onRemovingRemoteMedia = function (stream, remoteUserId) {
        var streamEvent = connection.streamEvents[stream.streamid];
        if (!streamEvent) {
            streamEvent = {
                stream: stream,
                type: 'remote',
                userid: remoteUserId,
                extra: connection.peers[remoteUserId] ? connection.peers[remoteUserId].extra : {},
                streamid: stream.streamid,
                mediaElement: connection.streamEvents[stream.streamid] ? connection.streamEvents[stream.streamid].mediaElement : null
            };
        }
        if (connection.peersBackup[streamEvent.userid]) {
            streamEvent.extra = connection.peersBackup[streamEvent.userid].extra;
        }
        connection.onstreamended(streamEvent);
        delete connection.streamEvents[stream.streamid];
    };
    mPeer.onNegotiationNeeded = function (message, remoteUserId, callback) {
        callback = callback || function () { };
        remoteUserId = remoteUserId || message.remoteUserId;
        message = message || '';
        // usually a message looks like this
        var messageToDeliver = {
            remoteUserId: remoteUserId,
            message: message,
            sender: connection.userid
        };
        if (message.remoteUserId && message.message && message.sender) {
            // if a code is manually passing required data
            messageToDeliver = message;
        }
        connectSocket(function () {
            connection.socket.emit(connection.socketMessageEvent, messageToDeliver, callback);
        });
    };
    function onUserLeft(remoteUserId) {
        connection.deletePeer(remoteUserId);
    }
    mPeer.onUserLeft = onUserLeft;
    mPeer.disconnectWith = function (remoteUserId, callback) {
        if (connection.socket) {
            connection.socket.emit('disconnect-with', remoteUserId, callback || function () { });
        }
        connection.deletePeer(remoteUserId);
    };
    connection.socketOptions = {
        // 'force new connection': true, // For SocketIO version < 1.0
        // 'forceNew': true, // For SocketIO version >= 1.0
        'transport': 'polling' // fixing transport:unknown issues
    };
    function connectSocket(connectCallback) {
        connection.socketAutoReConnect = true;
        if (connection.socket) { // todo: check here readySate/etc. to make sure socket is still opened
            if (connectCallback) {
                connectCallback(connection.socket);
            }
            return;
        }
        if (typeof SocketConnection === 'undefined') {
            if (typeof FirebaseConnection !== 'undefined') {
                window.SocketConnection = FirebaseConnection;
            }
            else if (typeof PubNubConnection !== 'undefined') {
                window.SocketConnection = PubNubConnection;
            }
            else {
                throw 'SocketConnection.js seems missed.';
            }
        }
        new SocketConnection(connection, function (s) {
            if (connectCallback) {
                connectCallback(connection.socket);
            }
        });
    }
    // 1st paramter is roomid
    // 2rd paramter is a callback function
    connection.openOrJoin = function (roomid, callback) {
        callback = callback || function () { };
        connection.checkPresence(roomid, function (isRoomExist, roomid) {
            if (isRoomExist) {
                connection.sessionid = roomid;
                var localPeerSdpConstraints = false;
                var remotePeerSdpConstraints = false;
                var isOneWay = !!connection.session.oneway;
                var isDataOnly = isData(connection.session);
                remotePeerSdpConstraints = {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                };
                localPeerSdpConstraints = {
                    OfferToReceiveAudio: isOneWay ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: isOneWay ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                };
                var connectionDescription = {
                    remoteUserId: connection.sessionid,
                    message: {
                        newParticipationRequest: true,
                        isOneWay: isOneWay,
                        isDataOnly: isDataOnly,
                        localPeerSdpConstraints: localPeerSdpConstraints,
                        remotePeerSdpConstraints: remotePeerSdpConstraints
                    },
                    sender: connection.userid
                };
                beforeJoin(connectionDescription.message, function () {
                    joinRoom(connectionDescription, callback);
                });
                return;
            }
            connection.waitingForLocalMedia = true;
            connection.isInitiator = true;
            connection.sessionid = roomid || connection.sessionid;
            if (isData(connection.session)) {
                openRoom(callback);
                return;
            }
            connection.captureUserMedia(function () {
                openRoom(callback);
            });
        });
    };
    // don't allow someone to join this person until he has the media
    connection.waitingForLocalMedia = false;
    connection.open = function (roomid, callback) {
        callback = callback || function () { };
        connection.waitingForLocalMedia = true;
        connection.isInitiator = true;
        connection.sessionid = roomid || connection.sessionid;
        connectSocket(function () {
            if (isData(connection.session)) {
                openRoom(callback);
                return;
            }
            connection.captureUserMedia(function () {
                openRoom(callback);
            });
        });
    };
    // this object keeps extra-data records for all connected users
    // this object is never cleared so you can always access extra-data even if a user left
    connection.peersBackup = {};
    connection.deletePeer = function (remoteUserId) {
        if (!remoteUserId || !connection.peers[remoteUserId]) {
            return;
        }
        var eventObject = {
            userid: remoteUserId,
            extra: connection.peers[remoteUserId] ? connection.peers[remoteUserId].extra : {}
        };
        if (connection.peersBackup[eventObject.userid]) {
            eventObject.extra = connection.peersBackup[eventObject.userid].extra;
        }
        connection.onleave(eventObject);
        if (!!connection.peers[remoteUserId]) {
            connection.peers[remoteUserId].streams.forEach(function (stream) {
                stream.stop();
            });
            var peer = connection.peers[remoteUserId].peer;
            if (peer && peer.iceConnectionState !== 'closed') {
                try {
                    peer.close();
                }
                catch (e) { }
            }
            if (connection.peers[remoteUserId]) {
                connection.peers[remoteUserId].peer = null;
                delete connection.peers[remoteUserId];
            }
        }
    };
    connection.rejoin = function (connectionDescription) {
        if (connection.isInitiator || !connectionDescription || !Object.keys(connectionDescription).length) {
            return;
        }
        var extra = {};
        if (connection.peers[connectionDescription.remoteUserId]) {
            extra = connection.peers[connectionDescription.remoteUserId].extra;
            connection.deletePeer(connectionDescription.remoteUserId);
        }
        if (connectionDescription && connectionDescription.remoteUserId) {
            connection.join(connectionDescription.remoteUserId);
            connection.onReConnecting({
                userid: connectionDescription.remoteUserId,
                extra: extra
            });
        }
    };
    connection.join = function (remoteUserId, options) {
        connection.sessionid = (remoteUserId ? remoteUserId.sessionid || remoteUserId.remoteUserId || remoteUserId : false) || connection.sessionid;
        connection.sessionid += '';
        var localPeerSdpConstraints = false;
        var remotePeerSdpConstraints = false;
        var isOneWay = false;
        var isDataOnly = false;
        if ((remoteUserId && remoteUserId.session) || !remoteUserId || typeof remoteUserId === 'string') {
            var session = remoteUserId ? remoteUserId.session || connection.session : connection.session;
            isOneWay = !!session.oneway;
            isDataOnly = isData(session);
            remotePeerSdpConstraints = {
                OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
            };
            localPeerSdpConstraints = {
                OfferToReceiveAudio: isOneWay ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                OfferToReceiveVideo: isOneWay ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
            };
        }
        options = options || {};
        var cb = function () { };
        if (typeof options === 'function') {
            cb = options;
            options = {};
        }
        if (typeof options.localPeerSdpConstraints !== 'undefined') {
            localPeerSdpConstraints = options.localPeerSdpConstraints;
        }
        if (typeof options.remotePeerSdpConstraints !== 'undefined') {
            remotePeerSdpConstraints = options.remotePeerSdpConstraints;
        }
        if (typeof options.isOneWay !== 'undefined') {
            isOneWay = options.isOneWay;
        }
        if (typeof options.isDataOnly !== 'undefined') {
            isDataOnly = options.isDataOnly;
        }
        var connectionDescription = {
            remoteUserId: connection.sessionid,
            message: {
                newParticipationRequest: true,
                isOneWay: isOneWay,
                isDataOnly: isDataOnly,
                localPeerSdpConstraints: localPeerSdpConstraints,
                remotePeerSdpConstraints: remotePeerSdpConstraints
            },
            sender: connection.userid
        };
        beforeJoin(connectionDescription.message, function () {
            connectSocket(function () {
                joinRoom(connectionDescription, cb);
            });
        });
        return connectionDescription;
    };
    function joinRoom(connectionDescription, cb) {
        connection.socket.emit('join-room', {
            sessionid: connection.sessionid,
            session: connection.session,
            mediaConstraints: connection.mediaConstraints,
            sdpConstraints: connection.sdpConstraints,
            streams: getStreamInfoForAdmin(),
            extra: connection.extra,
            password: typeof connection.password !== 'undefined' && typeof connection.password !== 'object' ? connection.password : ''
        }, function (isRoomJoined, error) {
            if (isRoomJoined === true) {
                if (connection.enableLogs) {
                    console.log('isRoomJoined: ', isRoomJoined, ' roomid: ', connection.sessionid);
                }
                if (!!connection.peers[connection.sessionid]) {
                    // on socket disconnect & reconnect
                    return;
                }
                mPeer.onNegotiationNeeded(connectionDescription);
            }
            if (isRoomJoined === false) {
                if (connection.enableLogs) {
                    console.warn('isRoomJoined: ', error, ' roomid: ', connection.sessionid);
                }
                // [disabled] retry after 3 seconds
                false && setTimeout(function () {
                    joinRoom(connectionDescription, cb);
                }, 3000);
            }
            cb(isRoomJoined, connection.sessionid, error);
        });
    }
    connection.publicRoomIdentifier = '';
    function openRoom(callback) {
        if (connection.enableLogs) {
            console.log('Sending open-room signal to socket.io');
        }
        connection.waitingForLocalMedia = false;
        connection.socket.emit('open-room', {
            sessionid: connection.sessionid,
            session: connection.session,
            mediaConstraints: connection.mediaConstraints,
            sdpConstraints: connection.sdpConstraints,
            streams: getStreamInfoForAdmin(),
            extra: connection.extra,
            identifier: connection.publicRoomIdentifier,
            password: typeof connection.password !== 'undefined' && typeof connection.password !== 'object' ? connection.password : ''
        }, function (isRoomOpened, error) {
            if (isRoomOpened === true) {
                if (connection.enableLogs) {
                    console.log('isRoomOpened: ', isRoomOpened, ' roomid: ', connection.sessionid);
                }
                callback(isRoomOpened, connection.sessionid);
            }
            if (isRoomOpened === false) {
                if (connection.enableLogs) {
                    console.warn('isRoomOpened: ', error, ' roomid: ', connection.sessionid);
                }
                callback(isRoomOpened, connection.sessionid, error);
            }
        });
    }
    function getStreamInfoForAdmin() {
        try {
            return connection.streamEvents.selectAll('local').map(function (event) {
                return {
                    streamid: event.streamid,
                    tracks: event.stream.getTracks().length
                };
            });
        }
        catch (e) {
            return [];
        }
    }
    function beforeJoin(userPreferences, callback) {
        if (connection.dontCaptureUserMedia || userPreferences.isDataOnly) {
            callback();
            return;
        }
        var localMediaConstraints = {};
        if (userPreferences.localPeerSdpConstraints.OfferToReceiveAudio) {
            localMediaConstraints.audio = connection.mediaConstraints.audio;
        }
        if (userPreferences.localPeerSdpConstraints.OfferToReceiveVideo) {
            localMediaConstraints.video = connection.mediaConstraints.video;
        }
        var session = userPreferences.session || connection.session;
        if (session.oneway && session.audio !== 'two-way' && session.video !== 'two-way' && session.screen !== 'two-way') {
            callback();
            return;
        }
        if (session.oneway && session.audio && session.audio === 'two-way') {
            session = {
                audio: true
            };
        }
        if (session.audio || session.video || session.screen) {
            if (session.screen) {
                if (DetectRTC.browser.name === 'Edge') {
                    navigator.getDisplayMedia({
                        video: true,
                        audio: isAudioPlusTab(connection)
                    }).then(function (screen) {
                        screen.isScreen = true;
                        mPeer.onGettingLocalMedia(screen);
                        if ((session.audio || session.video) && !isAudioPlusTab(connection)) {
                            connection.invokeGetUserMedia(null, callback);
                        }
                        else {
                            callback(screen);
                        }
                    }, function (error) {
                        console.error('Unable to capture screen on Edge. HTTPs and version 17+ is required.');
                    });
                }
                else {
                    connection.invokeGetUserMedia({
                        audio: isAudioPlusTab(connection),
                        video: true,
                        isScreen: true
                    }, (session.audio || session.video) && !isAudioPlusTab(connection) ? connection.invokeGetUserMedia(null, callback) : callback);
                }
            }
            else if (session.audio || session.video) {
                connection.invokeGetUserMedia(null, callback, session);
            }
        }
    }
    connection.getUserMedia = connection.captureUserMedia = function (callback, sessionForced) {
        callback = callback || function () { };
        var session = sessionForced || connection.session;
        if (connection.dontCaptureUserMedia || isData(session)) {
            callback();
            return;
        }
        if (session.audio || session.video || session.screen) {
            if (session.screen) {
                if (DetectRTC.browser.name === 'Edge') {
                    navigator.getDisplayMedia({
                        video: true,
                        audio: isAudioPlusTab(connection)
                    }).then(function (screen) {
                        screen.isScreen = true;
                        mPeer.onGettingLocalMedia(screen);
                        if ((session.audio || session.video) && !isAudioPlusTab(connection)) {
                            var nonScreenSession = {};
                            for (var s in session) {
                                if (s !== 'screen') {
                                    nonScreenSession[s] = session[s];
                                }
                            }
                            connection.invokeGetUserMedia(sessionForced, callback, nonScreenSession);
                            return;
                        }
                        callback(screen);
                    }, function (error) {
                        console.error('Unable to capture screen on Edge. HTTPs and version 17+ is required.');
                    });
                }
                else {
                    connection.invokeGetUserMedia({
                        audio: isAudioPlusTab(connection),
                        video: true,
                        isScreen: true
                    }, function (stream) {
                        if ((session.audio || session.video) && !isAudioPlusTab(connection)) {
                            var nonScreenSession = {};
                            for (var s in session) {
                                if (s !== 'screen') {
                                    nonScreenSession[s] = session[s];
                                }
                            }
                            connection.invokeGetUserMedia(sessionForced, callback, nonScreenSession);
                            return;
                        }
                        callback(stream);
                    });
                }
            }
            else if (session.audio || session.video) {
                connection.invokeGetUserMedia(sessionForced, callback, session);
            }
        }
    };
    connection.onbeforeunload = function (arg1, dontCloseSocket) {
        if (!connection.closeBeforeUnload) {
            return;
        }
        connection.peers.getAllParticipants().forEach(function (participant) {
            mPeer.onNegotiationNeeded({
                userLeft: true
            }, participant);
            if (connection.peers[participant] && connection.peers[participant].peer) {
                connection.peers[participant].peer.close();
            }
            delete connection.peers[participant];
        });
        if (!dontCloseSocket) {
            connection.closeSocket();
        }
        connection.isInitiator = false;
    };
    if (!window.ignoreBeforeUnload) {
        // user can implement its own version of window.onbeforeunload
        connection.closeBeforeUnload = true;
        window.addEventListener('beforeunload', connection.onbeforeunload, false);
    }
    else {
        connection.closeBeforeUnload = false;
    }
    connection.userid = getRandomString();
    connection.changeUserId = function (newUserId, callback) {
        callback = callback || function () { };
        connection.userid = newUserId || getRandomString();
        connection.socket.emit('changed-uuid', connection.userid, callback);
    };
    connection.extra = {};
    connection.attachStreams = [];
    connection.session = {
        audio: true,
        video: true
    };
    connection.enableFileSharing = false;
    // all values in kbps
    connection.bandwidth = {
        screen: false,
        audio: false,
        video: false
    };
    connection.codecs = {
        audio: 'opus',
        video: 'VP9'
    };
    connection.processSdp = function (sdp) {
        // ignore SDP modification if unified-pan is supported
        if (isUnifiedPlanSupportedDefault()) {
            return sdp;
        }
        if (DetectRTC.browser.name === 'Safari') {
            return sdp;
        }
        if (connection.codecs.video.toUpperCase() === 'VP8') {
            sdp = CodecsHandler.preferCodec(sdp, 'vp8');
        }
        if (connection.codecs.video.toUpperCase() === 'VP9') {
            sdp = CodecsHandler.preferCodec(sdp, 'vp9');
        }
        if (connection.codecs.video.toUpperCase() === 'H264') {
            sdp = CodecsHandler.preferCodec(sdp, 'h264');
        }
        if (connection.codecs.audio === 'G722') {
            sdp = CodecsHandler.removeNonG722(sdp);
        }
        if (DetectRTC.browser.name === 'Firefox') {
            return sdp;
        }
        if (connection.bandwidth.video || connection.bandwidth.screen) {
            sdp = CodecsHandler.setApplicationSpecificBandwidth(sdp, connection.bandwidth, !!connection.session.screen);
        }
        if (connection.bandwidth.video) {
            sdp = CodecsHandler.setVideoBitrates(sdp, {
                min: connection.bandwidth.video * 8 * 1024,
                max: connection.bandwidth.video * 8 * 1024
            });
        }
        if (connection.bandwidth.audio) {
            sdp = CodecsHandler.setOpusAttributes(sdp, {
                maxaveragebitrate: connection.bandwidth.audio * 8 * 1024,
                maxplaybackrate: connection.bandwidth.audio * 8 * 1024,
                stereo: 1,
                maxptime: 3
            });
        }
        return sdp;
    };
    if (typeof CodecsHandler !== 'undefined') {
        connection.BandwidthHandler = connection.CodecsHandler = CodecsHandler;
    }
    connection.mediaConstraints = {
        audio: {
            mandatory: {},
            optional: connection.bandwidth.audio ? [{
                    bandwidth: connection.bandwidth.audio * 8 * 1024 || 128 * 8 * 1024
                }] : []
        },
        video: {
            mandatory: {},
            optional: connection.bandwidth.video ? [{
                    bandwidth: connection.bandwidth.video * 8 * 1024 || 128 * 8 * 1024
                }, {
                    facingMode: 'user'
                }] : [{
                    facingMode: 'user'
                }]
        }
    };
    if (DetectRTC.browser.name === 'Firefox') {
        connection.mediaConstraints = {
            audio: true,
            video: true
        };
    }
    if (!forceOptions.useDefaultDevices && !DetectRTC.isMobileDevice) {
        DetectRTC.load(function () {
            var lastAudioDevice, lastVideoDevice;
            // it will force RTCMultiConnection to capture last-devices
            // i.e. if external microphone is attached to system, we should prefer it over built-in devices.
            DetectRTC.MediaDevices.forEach(function (device) {
                if (device.kind === 'audioinput' && connection.mediaConstraints.audio !== false) {
                    lastAudioDevice = device;
                }
                if (device.kind === 'videoinput' && connection.mediaConstraints.video !== false) {
                    lastVideoDevice = device;
                }
            });
            if (lastAudioDevice) {
                if (DetectRTC.browser.name === 'Firefox') {
                    if (connection.mediaConstraints.audio !== true) {
                        connection.mediaConstraints.audio.deviceId = lastAudioDevice.id;
                    }
                    else {
                        connection.mediaConstraints.audio = {
                            deviceId: lastAudioDevice.id
                        };
                    }
                    return;
                }
                if (connection.mediaConstraints.audio == true) {
                    connection.mediaConstraints.audio = {
                        mandatory: {},
                        optional: []
                    };
                }
                if (!connection.mediaConstraints.audio.optional) {
                    connection.mediaConstraints.audio.optional = [];
                }
                var optional = [{
                        sourceId: lastAudioDevice.id
                    }];
                connection.mediaConstraints.audio.optional = optional.concat(connection.mediaConstraints.audio.optional);
            }
            if (lastVideoDevice) {
                if (DetectRTC.browser.name === 'Firefox') {
                    if (connection.mediaConstraints.video !== true) {
                        connection.mediaConstraints.video.deviceId = lastVideoDevice.id;
                    }
                    else {
                        connection.mediaConstraints.video = {
                            deviceId: lastVideoDevice.id
                        };
                    }
                    return;
                }
                if (connection.mediaConstraints.video == true) {
                    connection.mediaConstraints.video = {
                        mandatory: {},
                        optional: []
                    };
                }
                if (!connection.mediaConstraints.video.optional) {
                    connection.mediaConstraints.video.optional = [];
                }
                var optional = [{
                        sourceId: lastVideoDevice.id
                    }];
                connection.mediaConstraints.video.optional = optional.concat(connection.mediaConstraints.video.optional);
            }
        });
    }
    connection.sdpConstraints = {
        mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: true
        },
        optional: [{
                VoiceActivityDetection: false
            }]
    };
    connection.sdpSemantics = null; // "unified-plan" or "plan-b", ref: webrtc.org/web-apis/chrome/unified-plan/
    connection.iceCandidatePoolSize = null; // 0
    connection.bundlePolicy = null; // max-bundle
    connection.rtcpMuxPolicy = null; // "require" or "negotiate"
    connection.iceTransportPolicy = null; // "relay" or "all"
    connection.optionalArgument = {
        optional: [{
                DtlsSrtpKeyAgreement: true
            }, {
                googImprovedWifiBwe: true
            }, {
                googScreencastMinBitrate: 300
            }, {
                googIPv6: true
            }, {
                googDscp: true
            }, {
                googCpuUnderuseThreshold: 55
            }, {
                googCpuOveruseThreshold: 85
            }, {
                googSuspendBelowMinBitrate: true
            }, {
                googCpuOveruseDetection: true
            }],
        mandatory: {}
    };
    connection.iceServers = IceServersHandler.getIceServers(connection);
    connection.candidates = {
        host: true,
        stun: true,
        turn: true
    };
    connection.iceProtocols = {
        tcp: true,
        udp: true
    };
    // EVENTs
    connection.onopen = function (event) {
        if (!!connection.enableLogs) {
            console.info('Data connection has been opened between you & ', event.userid);
        }
    };
    connection.onclose = function (event) {
        if (!!connection.enableLogs) {
            console.warn('Data connection has been closed between you & ', event.userid);
        }
    };
    connection.onerror = function (error) {
        if (!!connection.enableLogs) {
            console.error(error.userid, 'data-error', error);
        }
    };
    connection.onmessage = function (event) {
        if (!!connection.enableLogs) {
            console.debug('data-message', event.userid, event.data);
        }
    };
    connection.send = function (data, remoteUserId) {
        connection.peers.send(data, remoteUserId);
    };
    connection.close = connection.disconnect = connection.leave = function () {
        connection.onbeforeunload(false, true);
    };
    connection.closeEntireSession = function (callback) {
        callback = callback || function () { };
        connection.socket.emit('close-entire-session', function looper() {
            if (connection.getAllParticipants().length) {
                setTimeout(looper, 100);
                return;
            }
            connection.onEntireSessionClosed({
                sessionid: connection.sessionid,
                userid: connection.userid,
                extra: connection.extra
            });
            connection.changeUserId(null, function () {
                connection.close();
                callback();
            });
        });
    };
    connection.onEntireSessionClosed = function (event) {
        if (!connection.enableLogs)
            return;
        console.info('Entire session is closed: ', event.sessionid, event.extra);
    };
    connection.onstream = function (e) {
        var parentNode = connection.videosContainer;
        parentNode.insertBefore(e.mediaElement, parentNode.firstChild);
        var played = e.mediaElement.play();
        if (typeof played !== 'undefined') {
            played.catch(function () {
                /*** iOS 11 doesn't allow automatic play and rejects ***/
            }).then(function () {
                setTimeout(function () {
                    e.mediaElement.play();
                }, 2000);
            });
            return;
        }
        setTimeout(function () {
            e.mediaElement.play();
        }, 2000);
    };
    connection.onstreamended = function (e) {
        if (!e.mediaElement) {
            e.mediaElement = document.getElementById(e.streamid);
        }
        if (!e.mediaElement || !e.mediaElement.parentNode) {
            return;
        }
        e.mediaElement.parentNode.removeChild(e.mediaElement);
    };
    connection.direction = 'many-to-many';
    connection.removeStream = function (streamid, remoteUserId) {
        var stream;
        connection.attachStreams.forEach(function (localStream) {
            if (localStream.id === streamid) {
                stream = localStream;
            }
        });
        if (!stream) {
            console.warn('No such stream exist.', streamid);
            return;
        }
        connection.peers.getAllParticipants().forEach(function (participant) {
            if (remoteUserId && participant !== remoteUserId) {
                return;
            }
            var user = connection.peers[participant];
            try {
                user.peer.removeStream(stream);
            }
            catch (e) { }
        });
        connection.renegotiate();
    };
    connection.addStream = function (session, remoteUserId) {
        if (!!session.getTracks) {
            if (connection.attachStreams.indexOf(session) === -1) {
                if (!session.streamid) {
                    session.streamid = session.id;
                }
                connection.attachStreams.push(session);
            }
            connection.renegotiate(remoteUserId);
            return;
        }
        if (isData(session)) {
            connection.renegotiate(remoteUserId);
            return;
        }
        if (session.audio || session.video || session.screen) {
            if (session.screen) {
                if (DetectRTC.browser.name === 'Edge') {
                    navigator.getDisplayMedia({
                        video: true,
                        audio: isAudioPlusTab(connection)
                    }).then(function (screen) {
                        screen.isScreen = true;
                        mPeer.onGettingLocalMedia(screen);
                        if ((session.audio || session.video) && !isAudioPlusTab(connection)) {
                            connection.invokeGetUserMedia(null, function (stream) {
                                gumCallback(stream);
                            });
                        }
                        else {
                            gumCallback(screen);
                        }
                    }, function (error) {
                        console.error('Unable to capture screen on Edge. HTTPs and version 17+ is required.');
                    });
                }
                else {
                    connection.invokeGetUserMedia({
                        audio: isAudioPlusTab(connection),
                        video: true,
                        isScreen: true
                    }, function (stream) {
                        if ((session.audio || session.video) && !isAudioPlusTab(connection)) {
                            connection.invokeGetUserMedia(null, function (stream) {
                                gumCallback(stream);
                            });
                        }
                        else {
                            gumCallback(stream);
                        }
                    });
                }
            }
            else if (session.audio || session.video) {
                connection.invokeGetUserMedia(null, gumCallback);
            }
        }
        function gumCallback(stream) {
            if (session.streamCallback) {
                session.streamCallback(stream);
            }
            connection.renegotiate(remoteUserId);
        }
    };
    connection.invokeGetUserMedia = function (localMediaConstraints, callback, session) {
        if (!session) {
            session = connection.session;
        }
        if (!localMediaConstraints) {
            localMediaConstraints = connection.mediaConstraints;
        }
        getUserMediaHandler({
            onGettingLocalMedia: function (stream) {
                var videoConstraints = localMediaConstraints.video;
                if (videoConstraints) {
                    if (videoConstraints.mediaSource || videoConstraints.mozMediaSource) {
                        stream.isScreen = true;
                    }
                    else if (videoConstraints.mandatory && videoConstraints.mandatory.chromeMediaSource) {
                        stream.isScreen = true;
                    }
                }
                if (!stream.isScreen) {
                    stream.isVideo = !!getTracks(stream, 'video').length;
                    stream.isAudio = !stream.isVideo && getTracks(stream, 'audio').length;
                }
                mPeer.onGettingLocalMedia(stream, function () {
                    if (typeof callback === 'function') {
                        callback(stream);
                    }
                });
            },
            onLocalMediaError: function (error, constraints) {
                mPeer.onLocalMediaError(error, constraints);
            },
            localMediaConstraints: localMediaConstraints || {
                audio: session.audio ? localMediaConstraints.audio : false,
                video: session.video ? localMediaConstraints.video : false
            }
        });
    };
    function applyConstraints(stream, mediaConstraints) {
        if (!stream) {
            if (!!connection.enableLogs) {
                console.error('No stream to applyConstraints.');
            }
            return;
        }
        if (mediaConstraints.audio) {
            getTracks(stream, 'audio').forEach(function (track) {
                track.applyConstraints(mediaConstraints.audio);
            });
        }
        if (mediaConstraints.video) {
            getTracks(stream, 'video').forEach(function (track) {
                track.applyConstraints(mediaConstraints.video);
            });
        }
    }
    connection.applyConstraints = function (mediaConstraints, streamid) {
        if (!MediaStreamTrack || !MediaStreamTrack.prototype.applyConstraints) {
            alert('track.applyConstraints is NOT supported in your browser.');
            return;
        }
        if (streamid) {
            var stream;
            if (connection.streamEvents[streamid]) {
                stream = connection.streamEvents[streamid].stream;
            }
            applyConstraints(stream, mediaConstraints);
            return;
        }
        connection.attachStreams.forEach(function (stream) {
            applyConstraints(stream, mediaConstraints);
        });
    };
    function replaceTrack(track, remoteUserId, isVideoTrack) {
        if (remoteUserId) {
            mPeer.replaceTrack(track, remoteUserId, isVideoTrack);
            return;
        }
        connection.peers.getAllParticipants().forEach(function (participant) {
            mPeer.replaceTrack(track, participant, isVideoTrack);
        });
    }
    connection.replaceTrack = function (session, remoteUserId, isVideoTrack) {
        session = session || {};
        if (!RTCPeerConnection.prototype.getSenders) {
            connection.addStream(session);
            return;
        }
        if (session instanceof MediaStreamTrack) {
            replaceTrack(session, remoteUserId, isVideoTrack);
            return;
        }
        if (session instanceof MediaStream) {
            if (getTracks(session, 'video').length) {
                replaceTrack(getTracks(session, 'video')[0], remoteUserId, true);
            }
            if (getTracks(session, 'audio').length) {
                replaceTrack(getTracks(session, 'audio')[0], remoteUserId, false);
            }
            return;
        }
        if (isData(session)) {
            throw 'connection.replaceTrack requires audio and/or video and/or screen.';
            return;
        }
        if (session.audio || session.video || session.screen) {
            if (session.screen) {
                if (DetectRTC.browser.name === 'Edge') {
                    navigator.getDisplayMedia({
                        video: true,
                        audio: isAudioPlusTab(connection)
                    }).then(function (screen) {
                        screen.isScreen = true;
                        mPeer.onGettingLocalMedia(screen);
                        if ((session.audio || session.video) && !isAudioPlusTab(connection)) {
                            connection.invokeGetUserMedia(null, gumCallback);
                        }
                        else {
                            gumCallback(screen);
                        }
                    }, function (error) {
                        console.error('Unable to capture screen on Edge. HTTPs and version 17+ is required.');
                    });
                }
                else {
                    connection.invokeGetUserMedia({
                        audio: isAudioPlusTab(connection),
                        video: true,
                        isScreen: true
                    }, (session.audio || session.video) && !isAudioPlusTab(connection) ? connection.invokeGetUserMedia(null, gumCallback) : gumCallback);
                }
            }
            else if (session.audio || session.video) {
                connection.invokeGetUserMedia(null, gumCallback);
            }
        }
        function gumCallback(stream) {
            connection.replaceTrack(stream, remoteUserId, isVideoTrack || session.video || session.screen);
        }
    };
    connection.resetTrack = function (remoteUsersIds, isVideoTrack) {
        if (!remoteUsersIds) {
            remoteUsersIds = connection.getAllParticipants();
        }
        if (typeof remoteUsersIds == 'string') {
            remoteUsersIds = [remoteUsersIds];
        }
        remoteUsersIds.forEach(function (participant) {
            var peer = connection.peers[participant].peer;
            if ((typeof isVideoTrack === 'undefined' || isVideoTrack === true) && peer.lastVideoTrack) {
                connection.replaceTrack(peer.lastVideoTrack, participant, true);
            }
            if ((typeof isVideoTrack === 'undefined' || isVideoTrack === false) && peer.lastAudioTrack) {
                connection.replaceTrack(peer.lastAudioTrack, participant, false);
            }
        });
    };
    connection.renegotiate = function (remoteUserId) {
        if (remoteUserId) {
            mPeer.renegotiatePeer(remoteUserId);
            return;
        }
        connection.peers.getAllParticipants().forEach(function (participant) {
            mPeer.renegotiatePeer(participant);
        });
    };
    connection.setStreamEndHandler = function (stream, isRemote) {
        if (!stream || !stream.addEventListener)
            return;
        isRemote = !!isRemote;
        if (stream.alreadySetEndHandler) {
            return;
        }
        stream.alreadySetEndHandler = true;
        var streamEndedEvent = 'ended';
        if ('oninactive' in stream) {
            streamEndedEvent = 'inactive';
        }
        stream.addEventListener(streamEndedEvent, function () {
            if (stream.idInstance) {
                currentUserMediaRequest.remove(stream.idInstance);
            }
            if (!isRemote) {
                // reset attachStreams
                var streams = [];
                connection.attachStreams.forEach(function (s) {
                    if (s.id != stream.id) {
                        streams.push(s);
                    }
                });
                connection.attachStreams = streams;
            }
            // connection.renegotiate();
            var streamEvent = connection.streamEvents[stream.streamid];
            if (!streamEvent) {
                streamEvent = {
                    stream: stream,
                    streamid: stream.streamid,
                    type: isRemote ? 'remote' : 'local',
                    userid: connection.userid,
                    extra: connection.extra,
                    mediaElement: connection.streamEvents[stream.streamid] ? connection.streamEvents[stream.streamid].mediaElement : null
                };
            }
            if (isRemote && connection.peers[streamEvent.userid]) {
                // reset remote "streams"
                var peer = connection.peers[streamEvent.userid].peer;
                var streams = [];
                peer.getRemoteStreams().forEach(function (s) {
                    if (s.id != stream.id) {
                        streams.push(s);
                    }
                });
                connection.peers[streamEvent.userid].streams = streams;
            }
            if (streamEvent.userid === connection.userid && streamEvent.type === 'remote') {
                return;
            }
            if (connection.peersBackup[streamEvent.userid]) {
                streamEvent.extra = connection.peersBackup[streamEvent.userid].extra;
            }
            connection.onstreamended(streamEvent);
            delete connection.streamEvents[stream.streamid];
        }, false);
    };
    connection.onMediaError = function (error, constraints) {
        if (!!connection.enableLogs) {
            console.error(error, constraints);
        }
    };
    connection.autoCloseEntireSession = false;
    connection.filesContainer = connection.videosContainer = document.body || document.documentElement;
    connection.isInitiator = false;
    connection.shareFile = mPeer.shareFile;
    if (typeof FileProgressBarHandler !== 'undefined') {
        FileProgressBarHandler.handle(connection);
    }
    if (typeof TranslationHandler !== 'undefined') {
        TranslationHandler.handle(connection);
    }
    connection.token = getRandomString;
    connection.onNewParticipant = function (participantId, userPreferences) {
        connection.acceptParticipationRequest(participantId, userPreferences);
    };
    connection.acceptParticipationRequest = function (participantId, userPreferences) {
        if (userPreferences.successCallback) {
            userPreferences.successCallback();
            delete userPreferences.successCallback;
        }
        mPeer.createNewPeer(participantId, userPreferences);
    };
    if (typeof StreamsHandler !== 'undefined') {
        connection.StreamsHandler = StreamsHandler;
    }
    connection.onleave = function (userid) { };
    connection.invokeSelectFileDialog = function (callback) {
        var selector = new FileSelector();
        selector.accept = '*.*';
        selector.selectSingleFile(callback);
    };
    connection.onmute = function (e) {
        if (!e || !e.mediaElement) {
            return;
        }
        if (e.muteType === 'both' || e.muteType === 'video') {
            e.mediaElement.src = null;
            var paused = e.mediaElement.pause();
            if (typeof paused !== 'undefined') {
                paused.then(function () {
                    e.mediaElement.poster = e.snapshot || 'https://cdn.webrtc-experiment.com/images/muted.png';
                });
            }
            else {
                e.mediaElement.poster = e.snapshot || 'https://cdn.webrtc-experiment.com/images/muted.png';
            }
        }
        else if (e.muteType === 'audio') {
            e.mediaElement.muted = true;
        }
    };
    connection.onunmute = function (e) {
        if (!e || !e.mediaElement || !e.stream) {
            return;
        }
        if (e.unmuteType === 'both' || e.unmuteType === 'video') {
            e.mediaElement.poster = null;
            e.mediaElement.srcObject = e.stream;
            e.mediaElement.play();
        }
        else if (e.unmuteType === 'audio') {
            e.mediaElement.muted = false;
        }
    };
    connection.onExtraDataUpdated = function (event) {
        event.status = 'online';
        connection.onUserStatusChanged(event, true);
    };
    connection.getAllParticipants = function (sender) {
        return connection.peers.getAllParticipants(sender);
    };
    if (typeof StreamsHandler !== 'undefined') {
        StreamsHandler.onSyncNeeded = function (streamid, action, type) {
            connection.peers.getAllParticipants().forEach(function (participant) {
                mPeer.onNegotiationNeeded({
                    streamid: streamid,
                    action: action,
                    streamSyncNeeded: true,
                    type: type || 'both'
                }, participant);
            });
        };
    }
    connection.connectSocket = function (callback) {
        connectSocket(callback);
    };
    connection.closeSocket = function () {
        try {
            io.sockets = {};
        }
        catch (e) { }
        ;
        if (!connection.socket)
            return;
        if (typeof connection.socket.disconnect === 'function') {
            connection.socket.disconnect();
        }
        if (typeof connection.socket.resetProps === 'function') {
            connection.socket.resetProps();
        }
        connection.socket = null;
    };
    connection.getSocket = function (callback) {
        if (!callback && connection.enableLogs) {
            console.warn('getSocket.callback paramter is required.');
        }
        callback = callback || function () { };
        if (!connection.socket) {
            connectSocket(function () {
                callback(connection.socket);
            });
        }
        else {
            callback(connection.socket);
        }
        return connection.socket; // callback is preferred over return-statement
    };
    connection.getRemoteStreams = mPeer.getRemoteStreams;
    var skipStreams = ['selectFirst', 'selectAll', 'forEach'];
    connection.streamEvents = {
        selectFirst: function (options) {
            return connection.streamEvents.selectAll(options)[0];
        },
        selectAll: function (options) {
            if (!options) {
                // default will always be all streams
                options = {
                    local: true,
                    remote: true,
                    isScreen: true,
                    isAudio: true,
                    isVideo: true
                };
            }
            if (options == 'local') {
                options = {
                    local: true
                };
            }
            if (options == 'remote') {
                options = {
                    remote: true
                };
            }
            if (options == 'screen') {
                options = {
                    isScreen: true
                };
            }
            if (options == 'audio') {
                options = {
                    isAudio: true
                };
            }
            if (options == 'video') {
                options = {
                    isVideo: true
                };
            }
            var streams = [];
            Object.keys(connection.streamEvents).forEach(function (key) {
                var event = connection.streamEvents[key];
                if (skipStreams.indexOf(key) !== -1)
                    return;
                var ignore = true;
                if (options.local && event.type === 'local') {
                    ignore = false;
                }
                if (options.remote && event.type === 'remote') {
                    ignore = false;
                }
                if (options.isScreen && event.stream.isScreen) {
                    ignore = false;
                }
                if (options.isVideo && event.stream.isVideo) {
                    ignore = false;
                }
                if (options.isAudio && event.stream.isAudio) {
                    ignore = false;
                }
                if (options.userid && event.userid === options.userid) {
                    ignore = false;
                }
                if (ignore === false) {
                    streams.push(event);
                }
            });
            return streams;
        }
    };
    connection.socketURL = '@@socketURL'; // generated via config.json
    connection.socketMessageEvent = '@@socketMessageEvent'; // generated via config.json
    connection.socketCustomEvent = '@@socketCustomEvent'; // generated via config.json
    connection.DetectRTC = DetectRTC;
    connection.setCustomSocketEvent = function (customEvent) {
        if (customEvent) {
            connection.socketCustomEvent = customEvent;
        }
        if (!connection.socket) {
            return;
        }
        connection.socket.emit('set-custom-socket-event-listener', connection.socketCustomEvent);
    };
    connection.getNumberOfBroadcastViewers = function (broadcastId, callback) {
        if (!connection.socket || !broadcastId || !callback)
            return;
        connection.socket.emit('get-number-of-users-in-specific-broadcast', broadcastId, callback);
    };
    connection.onNumberOfBroadcastViewersUpdated = function (event) {
        if (!connection.enableLogs || !connection.isInitiator)
            return;
        console.info('Number of broadcast (', event.broadcastId, ') viewers', event.numberOfBroadcastViewers);
    };
    connection.onUserStatusChanged = function (event, dontWriteLogs) {
        if (!!connection.enableLogs && !dontWriteLogs) {
            console.info(event.userid, event.status);
        }
    };
    connection.getUserMediaHandler = getUserMediaHandler;
    connection.multiPeersHandler = mPeer;
    connection.enableLogs = true;
    connection.setCustomSocketHandler = function (customSocketHandler) {
        if (typeof SocketConnection !== 'undefined') {
            SocketConnection = customSocketHandler;
        }
    };
    // default value should be 15k because [old]Firefox's receiving limit is 16k!
    // however 64k works chrome-to-chrome
    connection.chunkSize = 40 * 1000;
    connection.maxParticipantsAllowed = 1000;
    // eject or leave single user
    connection.disconnectWith = mPeer.disconnectWith;
    // check if room exist on server
    // we will pass roomid to the server and wait for callback (i.e. server's response)
    connection.checkPresence = function (roomid, callback) {
        roomid = roomid || connection.sessionid;
        if (SocketConnection.name === 'SSEConnection') {
            SSEConnection.checkPresence(roomid, function (isRoomExist, _roomid, extra) {
                if (!connection.socket) {
                    if (!isRoomExist) {
                        connection.userid = _roomid;
                    }
                    connection.connectSocket(function () {
                        callback(isRoomExist, _roomid, extra);
                    });
                    return;
                }
                callback(isRoomExist, _roomid);
            });
            return;
        }
        if (!connection.socket) {
            connection.connectSocket(function () {
                connection.checkPresence(roomid, callback);
            });
            return;
        }
        connection.socket.emit('check-presence', roomid + '', function (isRoomExist, _roomid, extra) {
            if (connection.enableLogs) {
                console.log('checkPresence.isRoomExist: ', isRoomExist, ' roomid: ', _roomid);
            }
            callback(isRoomExist, _roomid, extra);
        });
    };
    connection.onReadyForOffer = function (remoteUserId, userPreferences) {
        connection.multiPeersHandler.createNewPeer(remoteUserId, userPreferences);
    };
    connection.setUserPreferences = function (userPreferences) {
        if (connection.dontAttachStream) {
            userPreferences.dontAttachLocalStream = true;
        }
        if (connection.dontGetRemoteStream) {
            userPreferences.dontGetRemoteStream = true;
        }
        return userPreferences;
    };
    connection.updateExtraData = function () {
        connection.socket.emit('extra-data-updated', connection.extra);
    };
    connection.enableScalableBroadcast = false;
    connection.maxRelayLimitPerUser = 3; // each broadcast should serve only 3 users
    connection.dontCaptureUserMedia = false;
    connection.dontAttachStream = false;
    connection.dontGetRemoteStream = false;
    connection.onReConnecting = function (event) {
        if (connection.enableLogs) {
            console.info('ReConnecting with', event.userid, '...');
        }
    };
    connection.beforeAddingStream = function (stream) {
        return stream;
    };
    connection.beforeRemovingStream = function (stream) {
        return stream;
    };
    if (typeof isChromeExtensionAvailable !== 'undefined') {
        connection.checkIfChromeExtensionAvailable = isChromeExtensionAvailable;
    }
    if (typeof isFirefoxExtensionAvailable !== 'undefined') {
        connection.checkIfChromeExtensionAvailable = isFirefoxExtensionAvailable;
    }
    if (typeof getChromeExtensionStatus !== 'undefined') {
        connection.getChromeExtensionStatus = getChromeExtensionStatus;
    }
    connection.modifyScreenConstraints = function (screen_constraints) {
        return screen_constraints;
    };
    connection.onPeerStateChanged = function (state) {
        if (connection.enableLogs) {
            if (state.iceConnectionState.search(/closed|failed/gi) !== -1) {
                console.error('Peer connection is closed between you & ', state.userid, state.extra, 'state:', state.iceConnectionState);
            }
        }
    };
    connection.isOnline = true;
    listenEventHandler('online', function () {
        connection.isOnline = true;
    });
    listenEventHandler('offline', function () {
        connection.isOnline = false;
    });
    connection.isLowBandwidth = false;
    if (navigator && navigator.connection && navigator.connection.type) {
        connection.isLowBandwidth = navigator.connection.type.toString().toLowerCase().search(/wifi|cell/g) !== -1;
        if (connection.isLowBandwidth) {
            connection.bandwidth = {
                audio: false,
                video: false,
                screen: false
            };
            if (connection.mediaConstraints.audio && connection.mediaConstraints.audio.optional && connection.mediaConstraints.audio.optional.length) {
                var newArray = [];
                connection.mediaConstraints.audio.optional.forEach(function (opt) {
                    if (typeof opt.bandwidth === 'undefined') {
                        newArray.push(opt);
                    }
                });
                connection.mediaConstraints.audio.optional = newArray;
            }
            if (connection.mediaConstraints.video && connection.mediaConstraints.video.optional && connection.mediaConstraints.video.optional.length) {
                var newArray = [];
                connection.mediaConstraints.video.optional.forEach(function (opt) {
                    if (typeof opt.bandwidth === 'undefined') {
                        newArray.push(opt);
                    }
                });
                connection.mediaConstraints.video.optional = newArray;
            }
        }
    }
    connection.getExtraData = function (remoteUserId, callback) {
        if (!remoteUserId)
            throw 'remoteUserId is required.';
        if (typeof callback === 'function') {
            connection.socket.emit('get-remote-user-extra-data', remoteUserId, function (extra, remoteUserId, error) {
                callback(extra, remoteUserId, error);
            });
            return;
        }
        if (!connection.peers[remoteUserId]) {
            if (connection.peersBackup[remoteUserId]) {
                return connection.peersBackup[remoteUserId].extra;
            }
            return {};
        }
        return connection.peers[remoteUserId].extra;
    };
    if (!!forceOptions.autoOpenOrJoin) {
        connection.openOrJoin(connection.sessionid);
    }
    connection.onUserIdAlreadyTaken = function (useridAlreadyTaken, yourNewUserId) {
        // via #683
        connection.close();
        connection.closeSocket();
        connection.isInitiator = false;
        connection.userid = connection.token();
        connection.join(connection.sessionid);
        if (connection.enableLogs) {
            console.warn('Userid already taken.', useridAlreadyTaken, 'Your new userid:', connection.userid);
        }
    };
    connection.trickleIce = true;
    connection.version = '@@version';
    connection.onSettingLocalDescription = function (event) {
        if (connection.enableLogs) {
            console.info('Set local description for remote user', event.userid);
        }
    };
    connection.resetScreen = function () {
        sourceId = null;
        if (DetectRTC && DetectRTC.screen) {
            delete DetectRTC.screen.sourceId;
        }
        currentUserMediaRequest = {
            streams: [],
            mutex: false,
            queueRequests: []
        };
    };
    // if disabled, "event.mediaElement" for "onstream" will be NULL
    connection.autoCreateMediaElement = true;
    // set password
    connection.password = null;
    // set password
    connection.setPassword = function (password, callback) {
        callback = callback || function () { };
        if (connection.socket) {
            connection.socket.emit('set-password', password, callback);
        }
        else {
            connection.password = password;
            callback(true, connection.sessionid, null);
        }
    };
    connection.onSocketDisconnect = function (event) {
        if (connection.enableLogs) {
            console.warn('socket.io connection is closed');
        }
    };
    connection.onSocketError = function (event) {
        if (connection.enableLogs) {
            console.warn('socket.io connection is failed');
        }
    };
    // error messages
    connection.errors = {
        ROOM_NOT_AVAILABLE: 'Room not available',
        INVALID_PASSWORD: 'Invalid password',
        USERID_NOT_AVAILABLE: 'User ID does not exist',
        ROOM_PERMISSION_DENIED: 'Room permission denied',
        ROOM_FULL: 'Room full',
        DID_NOT_JOIN_ANY_ROOM: 'Did not join any room yet',
        INVALID_SOCKET: 'Invalid socket',
        PUBLIC_IDENTIFIER_MISSING: 'publicRoomIdentifier is required',
        INVALID_ADMIN_CREDENTIAL: 'Invalid username or password attempted'
    };
})(this);
// BandwidthHandler.js
var BandwidthHandler = (function () {
    var isMobileDevice = !!navigator.userAgent.match(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile/i);
    if (typeof cordova !== 'undefined') {
        isMobileDevice = true;
    }
    if (navigator && navigator.userAgent && navigator.userAgent.indexOf('Crosswalk') !== -1) {
        isMobileDevice = true;
    }
    function setBAS(sdp, bandwidth, isScreen) {
        if (!bandwidth) {
            return sdp;
        }
        if (typeof isFirefox !== 'undefined' && isFirefox) {
            return sdp;
        }
        if (isMobileDevice) {
            return sdp;
        }
        if (isScreen) {
            if (!bandwidth.screen) {
                console.warn('It seems that you are not using bandwidth for screen. Screen sharing is expected to fail.');
            }
            else if (bandwidth.screen < 300) {
                console.warn('It seems that you are using wrong bandwidth value for screen. Screen sharing is expected to fail.');
            }
        }
        // if screen; must use at least 300kbs
        if (bandwidth.screen && isScreen) {
            sdp = sdp.replace(/b=AS([^\r\n]+\r\n)/g, '');
            sdp = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:' + bandwidth.screen + '\r\n');
        }
        // remove existing bandwidth lines
        if (bandwidth.audio || bandwidth.video || bandwidth.data) {
            sdp = sdp.replace(/b=AS([^\r\n]+\r\n)/g, '');
        }
        if (bandwidth.audio) {
            sdp = sdp.replace(/a=mid:audio\r\n/g, 'a=mid:audio\r\nb=AS:' + bandwidth.audio + '\r\n');
        }
        if (bandwidth.video) {
            sdp = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:' + (isScreen ? bandwidth.screen : bandwidth.video) + '\r\n');
        }
        return sdp;
    }
    // Find the line in sdpLines that starts with |prefix|, and, if specified,
    // contains |substr| (case-insensitive search).
    function findLine(sdpLines, prefix, substr) {
        return findLineInRange(sdpLines, 0, -1, prefix, substr);
    }
    // Find the line in sdpLines[startLine...endLine - 1] that starts with |prefix|
    // and, if specified, contains |substr| (case-insensitive search).
    function findLineInRange(sdpLines, startLine, endLine, prefix, substr) {
        var realEndLine = endLine !== -1 ? endLine : sdpLines.length;
        for (var i = startLine; i < realEndLine; ++i) {
            if (sdpLines[i].indexOf(prefix) === 0) {
                if (!substr ||
                    sdpLines[i].toLowerCase().indexOf(substr.toLowerCase()) !== -1) {
                    return i;
                }
            }
        }
        return null;
    }
    // Gets the codec payload type from an a=rtpmap:X line.
    function getCodecPayloadType(sdpLine) {
        var pattern = new RegExp('a=rtpmap:(\\d+) \\w+\\/\\d+');
        var result = sdpLine.match(pattern);
        return (result && result.length === 2) ? result[1] : null;
    }
    function setVideoBitrates(sdp, params) {
        if (isMobileDevice) {
            return sdp;
        }
        params = params || {};
        var xgoogle_min_bitrate = params.min;
        var xgoogle_max_bitrate = params.max;
        var sdpLines = sdp.split('\r\n');
        // VP8
        var vp8Index = findLine(sdpLines, 'a=rtpmap', 'VP8/90000');
        var vp8Payload;
        if (vp8Index) {
            vp8Payload = getCodecPayloadType(sdpLines[vp8Index]);
        }
        if (!vp8Payload) {
            return sdp;
        }
        var rtxIndex = findLine(sdpLines, 'a=rtpmap', 'rtx/90000');
        var rtxPayload;
        if (rtxIndex) {
            rtxPayload = getCodecPayloadType(sdpLines[rtxIndex]);
        }
        if (!rtxIndex) {
            return sdp;
        }
        var rtxFmtpLineIndex = findLine(sdpLines, 'a=fmtp:' + rtxPayload.toString());
        if (rtxFmtpLineIndex !== null) {
            var appendrtxNext = '\r\n';
            appendrtxNext += 'a=fmtp:' + vp8Payload + ' x-google-min-bitrate=' + (xgoogle_min_bitrate || '228') + '; x-google-max-bitrate=' + (xgoogle_max_bitrate || '228');
            sdpLines[rtxFmtpLineIndex] = sdpLines[rtxFmtpLineIndex].concat(appendrtxNext);
            sdp = sdpLines.join('\r\n');
        }
        return sdp;
    }
    function setOpusAttributes(sdp, params) {
        if (isMobileDevice) {
            return sdp;
        }
        params = params || {};
        var sdpLines = sdp.split('\r\n');
        // Opus
        var opusIndex = findLine(sdpLines, 'a=rtpmap', 'opus/48000');
        var opusPayload;
        if (opusIndex) {
            opusPayload = getCodecPayloadType(sdpLines[opusIndex]);
        }
        if (!opusPayload) {
            return sdp;
        }
        var opusFmtpLineIndex = findLine(sdpLines, 'a=fmtp:' + opusPayload.toString());
        if (opusFmtpLineIndex === null) {
            return sdp;
        }
        var appendOpusNext = '';
        appendOpusNext += '; stereo=' + (typeof params.stereo != 'undefined' ? params.stereo : '1');
        appendOpusNext += '; sprop-stereo=' + (typeof params['sprop-stereo'] != 'undefined' ? params['sprop-stereo'] : '1');
        if (typeof params.maxaveragebitrate != 'undefined') {
            appendOpusNext += '; maxaveragebitrate=' + (params.maxaveragebitrate || 128 * 1024 * 8);
        }
        if (typeof params.maxplaybackrate != 'undefined') {
            appendOpusNext += '; maxplaybackrate=' + (params.maxplaybackrate || 128 * 1024 * 8);
        }
        if (typeof params.cbr != 'undefined') {
            appendOpusNext += '; cbr=' + (typeof params.cbr != 'undefined' ? params.cbr : '1');
        }
        if (typeof params.useinbandfec != 'undefined') {
            appendOpusNext += '; useinbandfec=' + params.useinbandfec;
        }
        if (typeof params.usedtx != 'undefined') {
            appendOpusNext += '; usedtx=' + params.usedtx;
        }
        if (typeof params.maxptime != 'undefined') {
            appendOpusNext += '\r\na=maxptime:' + params.maxptime;
        }
        sdpLines[opusFmtpLineIndex] = sdpLines[opusFmtpLineIndex].concat(appendOpusNext);
        sdp = sdpLines.join('\r\n');
        return sdp;
    }
    return {
        setApplicationSpecificBandwidth: function (sdp, bandwidth, isScreen) {
            return setBAS(sdp, bandwidth, isScreen);
        },
        setVideoBitrates: function (sdp, params) {
            return setVideoBitrates(sdp, params);
        },
        setOpusAttributes: function (sdp, params) {
            return setOpusAttributes(sdp, params);
        }
    };
})();
function BluetoothConnection(connection, connectCallback) {
    var channelId = connection.channel;
    connection.socket = {};
    function onBluetoothSignalingMessageCallback(data) {
        data = JSON.parse(data);
        if (data.eventName === connection.socketMessageEvent) {
            onMessagesCallback(data.data);
        }
        if (data.eventName === 'presence') {
            data = data.data;
            if (data.userid === connection.userid)
                return;
            connection.onUserStatusChanged({
                userid: data.userid,
                status: data.isOnline === true ? 'online' : 'offline',
                extra: connection.peers[data.userid] ? connection.peers[data.userid].extra : {}
            });
        }
    }
    function sendUsingBluetooth(data) {
        // send data using bluetooth
    }
    connection.socket.emit = function (eventName, data, callback) {
        if (eventName === 'changed-uuid')
            return;
        if (data.message && data.message.shiftedModerationControl)
            return;
        sendUsingBluetooth(JSON.stringify({
            eventName: eventName,
            data: data
        }));
        if (callback) {
            callback();
        }
    };
    connection.socket.onerror = function () {
        if (!connection.enableLogs)
            return;
        console.error('Socket connection is failed.');
    };
    connection.socket.onclose = function () {
        if (!connection.enableLogs)
            return;
        console.warn('Socket connection is closed.');
    };
    connection.socket.onopen = function () {
        if (connection.enableLogs) {
            console.info('PubNub connection is opened.');
        }
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: true
        });
        if (connectCallback)
            connectCallback(connection.socket);
    };
    connection.socket.onopen();
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.message.extra) {
            connection.peers[message.sender].extra = message.message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    window.addEventListener('beforeunload', function () {
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: false
        });
    }, false);
}
function FileSelector() {
    var selector = this;
    var noFileSelectedCallback = function () { };
    selector.selectSingleFile = function (callback, failure) {
        if (failure) {
            noFileSelectedCallback = failure;
        }
        selectFile(callback);
    };
    selector.selectMultipleFiles = function (callback, failure) {
        if (failure) {
            noFileSelectedCallback = failure;
        }
        selectFile(callback, true);
    };
    selector.selectDirectory = function (callback, failure) {
        if (failure) {
            noFileSelectedCallback = failure;
        }
        selectFile(callback, true, true);
    };
    selector.accept = '*.*';
    function selectFile(callback, multiple, directory) {
        callback = callback || function () { };
        var file = document.createElement('input');
        file.type = 'file';
        if (multiple) {
            file.multiple = true;
        }
        if (directory) {
            file.webkitdirectory = true;
        }
        file.accept = selector.accept;
        file.onclick = function () {
            file.clickStarted = true;
        };
        document.body.onfocus = function () {
            setTimeout(function () {
                if (!file.clickStarted)
                    return;
                file.clickStarted = false;
                if (!file.value) {
                    noFileSelectedCallback();
                }
            }, 500);
        };
        file.onchange = function () {
            if (multiple) {
                if (!file.files.length) {
                    console.error('No file selected.');
                    return;
                }
                var arr = [];
                Array.from(file.files).forEach(function (file) {
                    file.url = file.webkitRelativePath;
                    arr.push(file);
                });
                callback(arr);
                return;
            }
            if (!file.files[0]) {
                console.error('No file selected.');
                return;
            }
            callback(file.files[0]);
            file.parentNode.removeChild(file);
        };
        file.style.display = 'none';
        (document.body || document.documentElement).appendChild(file);
        fireClickEvent(file);
    }
    function getValidFileName(fileName) {
        if (!fileName) {
            fileName = 'file' + (new Date).toISOString().replace(/:|\.|-/g, '');
        }
        var a = fileName;
        a = a.replace(/^.*[\\\/]([^\\\/]*)$/i, "$1");
        a = a.replace(/\s/g, "_");
        a = a.replace(/,/g, '');
        a = a.toLowerCase();
        return a;
    }
    function fireClickEvent(element) {
        if (typeof element.click === 'function') {
            element.click();
            return;
        }
        if (typeof element.change === 'function') {
            element.change();
            return;
        }
        if (typeof document.createEvent('Event') !== 'undefined') {
            var event = document.createEvent('Event');
            if (typeof event.initEvent === 'function' && typeof element.dispatchEvent === 'function') {
                event.initEvent('click', true, true);
                element.dispatchEvent(event);
                return;
            }
        }
        var event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(event);
    }
}
function FirebaseConnection(connection, connectCallback) {
    function isData(session) {
        return !session.audio && !session.video && !session.screen && session.data;
    }
    connection.firebase = connection.firebase || 'webrtc';
    var channelId = connection.channel;
    connection.socket = new Firebase('https://' + connection.firebase + '.firebaseio.com/' + channelId);
    connection.socket.on('child_added', function (snap) {
        var data = JSON.parse(snap.val());
        if (data.eventName === connection.socketMessageEvent) {
            onMessagesCallback(data.data);
        }
        snap.ref().remove(); // for socket.io live behavior
    });
    connection.socket.onDisconnect().remove();
    connection.socket.emit = function (eventName, data, callback) {
        if (eventName === 'changed-uuid')
            return;
        if (data.message && data.message.shiftedModerationControl)
            return;
        connection.socket.push(JSON.stringify({
            eventName: eventName,
            data: data
        }));
        if (callback) {
            callback();
        }
    };
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.message.extra) {
            connection.peers[message.sender].extra = message.message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    new Firebase('https://' + connection.firebase + '.firebaseio.com/.info/connected').on('value', function (snap) {
        if (snap.val()) {
            if (connection.enableLogs) {
                console.info('Firebase connection is opened.');
            }
            if (connectCallback)
                connectCallback(connection.socket);
        }
    });
}
// Last time updated: 2017-08-31 4:03:22 AM UTC
// __________________________
// MediaStreamRecorder v1.3.4
// Open-Sourced: https://github.com/streamproc/MediaStreamRecorder
// --------------------------------------------------
// Muaz Khan     - www.MuazKhan.com
// MIT License   - www.WebRTC-Experiment.com/licence
// --------------------------------------------------
// ______________________
// MediaStreamRecorder.js
function MediaStreamRecorder(mediaStream) {
    if (!mediaStream) {
        throw 'MediaStream is mandatory.';
    }
    // void start(optional long timeSlice)
    // timestamp to fire "ondataavailable"
    this.start = function (timeSlice) {
        var Recorder;
        if (typeof MediaRecorder !== 'undefined') {
            Recorder = MediaRecorderWrapper;
        }
        else if (IsChrome || IsOpera || IsEdge) {
            if (this.mimeType.indexOf('video') !== -1) {
                Recorder = WhammyRecorder;
            }
            else if (this.mimeType.indexOf('audio') !== -1) {
                Recorder = StereoAudioRecorder;
            }
        }
        // video recorder (in GIF format)
        if (this.mimeType === 'image/gif') {
            Recorder = GifRecorder;
        }
        // audio/wav is supported only via StereoAudioRecorder
        // audio/pcm (int16) is supported only via StereoAudioRecorder
        if (this.mimeType === 'audio/wav' || this.mimeType === 'audio/pcm') {
            Recorder = StereoAudioRecorder;
        }
        // allows forcing StereoAudioRecorder.js on Edge/Firefox
        if (this.recorderType) {
            Recorder = this.recorderType;
        }
        mediaRecorder = new Recorder(mediaStream);
        mediaRecorder.blobs = [];
        var self = this;
        mediaRecorder.ondataavailable = function (data) {
            mediaRecorder.blobs.push(data);
            self.ondataavailable(data);
        };
        mediaRecorder.onstop = this.onstop;
        mediaRecorder.onStartedDrawingNonBlankFrames = this.onStartedDrawingNonBlankFrames;
        // Merge all data-types except "function"
        mediaRecorder = mergeProps(mediaRecorder, this);
        mediaRecorder.start(timeSlice);
    };
    this.onStartedDrawingNonBlankFrames = function () { };
    this.clearOldRecordedFrames = function () {
        if (!mediaRecorder) {
            return;
        }
        mediaRecorder.clearOldRecordedFrames();
    };
    this.stop = function () {
        if (mediaRecorder) {
            mediaRecorder.stop();
        }
    };
    this.ondataavailable = function (blob) {
        if (this.disableLogs)
            return;
        console.log('ondataavailable..', blob);
    };
    this.onstop = function (error) {
        console.warn('stopped..', error);
    };
    this.save = function (file, fileName) {
        if (!file) {
            if (!mediaRecorder) {
                return;
            }
            ConcatenateBlobs(mediaRecorder.blobs, mediaRecorder.blobs[0].type, function (concatenatedBlob) {
                invokeSaveAsDialog(concatenatedBlob);
            });
            return;
        }
        invokeSaveAsDialog(file, fileName);
    };
    this.pause = function () {
        if (!mediaRecorder) {
            return;
        }
        mediaRecorder.pause();
        if (this.disableLogs)
            return;
        console.log('Paused recording.', this.mimeType || mediaRecorder.mimeType);
    };
    this.resume = function () {
        if (!mediaRecorder) {
            return;
        }
        mediaRecorder.resume();
        if (this.disableLogs)
            return;
        console.log('Resumed recording.', this.mimeType || mediaRecorder.mimeType);
    };
    // StereoAudioRecorder || WhammyRecorder || MediaRecorderWrapper || GifRecorder
    this.recorderType = null;
    // video/webm or audio/webm or audio/ogg or audio/wav
    this.mimeType = 'video/webm';
    // logs are enabled by default
    this.disableLogs = false;
    // Reference to "MediaRecorder.js"
    var mediaRecorder;
}
// ______________________
// MultiStreamRecorder.js
function MultiStreamRecorder(arrayOfMediaStreams, options) {
    arrayOfMediaStreams = arrayOfMediaStreams || [];
    if (arrayOfMediaStreams instanceof MediaStream) {
        arrayOfMediaStreams = [arrayOfMediaStreams];
    }
    var self = this;
    var mixer;
    var mediaRecorder;
    options = options || {
        mimeType: 'video/webm',
        video: {
            width: 360,
            height: 240
        }
    };
    if (!options.frameInterval) {
        options.frameInterval = 10;
    }
    if (!options.video) {
        options.video = {};
    }
    if (!options.video.width) {
        options.video.width = 360;
    }
    if (!options.video.height) {
        options.video.height = 240;
    }
    this.start = function (timeSlice) {
        // github/muaz-khan/MultiStreamsMixer
        mixer = new MultiStreamsMixer(arrayOfMediaStreams);
        if (getVideoTracks().length) {
            mixer.frameInterval = options.frameInterval || 10;
            mixer.width = options.video.width || 360;
            mixer.height = options.video.height || 240;
            mixer.startDrawingFrames();
        }
        if (typeof self.previewStream === 'function') {
            self.previewStream(mixer.getMixedStream());
        }
        // record using MediaRecorder API
        mediaRecorder = new MediaStreamRecorder(mixer.getMixedStream());
        for (var prop in self) {
            if (typeof self[prop] !== 'function') {
                mediaRecorder[prop] = self[prop];
            }
        }
        mediaRecorder.ondataavailable = function (blob) {
            self.ondataavailable(blob);
        };
        mediaRecorder.onstop = self.onstop;
        mediaRecorder.start(timeSlice);
    };
    function getVideoTracks() {
        var tracks = [];
        arrayOfMediaStreams.forEach(function (stream) {
            stream.getVideoTracks().forEach(function (track) {
                tracks.push(track);
            });
        });
        return tracks;
    }
    this.stop = function (callback) {
        if (!mediaRecorder) {
            return;
        }
        mediaRecorder.stop(function (blob) {
            callback(blob);
        });
    };
    this.pause = function () {
        if (mediaRecorder) {
            mediaRecorder.pause();
        }
    };
    this.resume = function () {
        if (mediaRecorder) {
            mediaRecorder.resume();
        }
    };
    this.clearRecordedData = function () {
        if (mediaRecorder) {
            mediaRecorder.clearRecordedData();
            mediaRecorder = null;
        }
        if (mixer) {
            mixer.releaseStreams();
            mixer = null;
        }
    };
    this.addStreams = this.addStream = function (streams) {
        if (!streams) {
            throw 'First parameter is required.';
        }
        if (!(streams instanceof Array)) {
            streams = [streams];
        }
        arrayOfMediaStreams.concat(streams);
        if (!mediaRecorder || !mixer) {
            return;
        }
        mixer.appendStreams(streams);
    };
    this.resetVideoStreams = function (streams) {
        if (!mixer) {
            return;
        }
        if (streams && !(streams instanceof Array)) {
            streams = [streams];
        }
        mixer.resetVideoStreams(streams);
    };
    this.ondataavailable = function (blob) {
        if (self.disableLogs) {
            return;
        }
        console.log('ondataavailable', blob);
    };
    this.onstop = function () { };
    // for debugging
    this.name = 'MultiStreamRecorder';
    this.toString = function () {
        return this.name;
    };
}
if (typeof MediaStreamRecorder !== 'undefined') {
    MediaStreamRecorder.MultiStreamRecorder = MultiStreamRecorder;
}
// Last time updated: 2017-08-31 2:56:12 AM UTC
// ________________________
// MultiStreamsMixer v1.0.2
// Open-Sourced: https://github.com/muaz-khan/MultiStreamsMixer
// --------------------------------------------------
// Muaz Khan     - www.MuazKhan.com
// MIT License   - www.WebRTC-Experiment.com/licence
// --------------------------------------------------
function MultiStreamsMixer(arrayOfMediaStreams) {
    // requires: chrome://flags/#enable-experimental-web-platform-features
    var videos = [];
    var isStopDrawingFrames = false;
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    canvas.style = 'opacity:0;position:absolute;z-index:-1;top: -100000000;left:-1000000000; margin-top:-1000000000;margin-left:-1000000000;';
    (document.body || document.documentElement).appendChild(canvas);
    this.disableLogs = false;
    this.frameInterval = 10;
    this.width = 360;
    this.height = 240;
    // use gain node to prevent echo
    this.useGainNode = true;
    var self = this;
    // _____________________________
    // Cross-Browser-Declarations.js
    // WebAudio API representer
    var AudioContext = window.AudioContext;
    if (typeof AudioContext === 'undefined') {
        if (typeof webkitAudioContext !== 'undefined') {
            /*global AudioContext:true */
            AudioContext = webkitAudioContext;
        }
        if (typeof mozAudioContext !== 'undefined') {
            /*global AudioContext:true */
            AudioContext = mozAudioContext;
        }
    }
    /*jshint -W079 */
    var URL = window.URL;
    if (typeof URL === 'undefined' && typeof webkitURL !== 'undefined') {
        /*global URL:true */
        URL = webkitURL;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.getUserMedia === 'undefined') { // maybe window.navigator?
        if (typeof navigator.webkitGetUserMedia !== 'undefined') {
            navigator.getUserMedia = navigator.webkitGetUserMedia;
        }
        if (typeof navigator.mozGetUserMedia !== 'undefined') {
            navigator.getUserMedia = navigator.mozGetUserMedia;
        }
    }
    var MediaStream = window.MediaStream;
    if (typeof MediaStream === 'undefined' && typeof webkitMediaStream !== 'undefined') {
        MediaStream = webkitMediaStream;
    }
    /*global MediaStream:true */
    if (typeof MediaStream !== 'undefined') {
        if (!('getVideoTracks' in MediaStream.prototype)) {
            MediaStream.prototype.getVideoTracks = function () {
                if (!this.getTracks) {
                    return [];
                }
                var tracks = [];
                this.getTracks.forEach(function (track) {
                    if (track.kind.toString().indexOf('video') !== -1) {
                        tracks.push(track);
                    }
                });
                return tracks;
            };
            MediaStream.prototype.getAudioTracks = function () {
                if (!this.getTracks) {
                    return [];
                }
                var tracks = [];
                this.getTracks.forEach(function (track) {
                    if (track.kind.toString().indexOf('audio') !== -1) {
                        tracks.push(track);
                    }
                });
                return tracks;
            };
        }
        // override "stop" method for all browsers
        if (typeof MediaStream.prototype.stop === 'undefined') {
            MediaStream.prototype.stop = function () {
                this.getTracks().forEach(function (track) {
                    track.stop();
                });
            };
        }
    }
    var Storage = {};
    if (typeof AudioContext !== 'undefined') {
        Storage.AudioContext = AudioContext;
    }
    else if (typeof webkitAudioContext !== 'undefined') {
        Storage.AudioContext = webkitAudioContext;
    }
    this.startDrawingFrames = function () {
        drawVideosToCanvas();
    };
    function drawVideosToCanvas() {
        if (isStopDrawingFrames) {
            return;
        }
        var videosLength = videos.length;
        var fullcanvas = false;
        var remaining = [];
        videos.forEach(function (video) {
            if (!video.stream) {
                video.stream = {};
            }
            if (video.stream.fullcanvas) {
                fullcanvas = video;
            }
            else {
                remaining.push(video);
            }
        });
        if (fullcanvas) {
            canvas.width = fullcanvas.stream.width;
            canvas.height = fullcanvas.stream.height;
        }
        else if (remaining.length) {
            canvas.width = videosLength > 1 ? remaining[0].width * 2 : remaining[0].width;
            canvas.height = videosLength > 2 ? remaining[0].height * 2 : remaining[0].height;
        }
        else {
            canvas.width = self.width || 360;
            canvas.height = self.height || 240;
        }
        if (fullcanvas && fullcanvas instanceof HTMLVideoElement) {
            drawImage(fullcanvas);
        }
        remaining.forEach(function (video, idx) {
            drawImage(video, idx);
        });
        setTimeout(drawVideosToCanvas, self.frameInterval);
    }
    function drawImage(video, idx) {
        if (isStopDrawingFrames) {
            return;
        }
        var x = 0;
        var y = 0;
        var width = video.width;
        var height = video.height;
        if (idx === 1) {
            x = video.width;
        }
        if (idx === 2) {
            y = video.height;
        }
        if (idx === 3) {
            x = video.width;
            y = video.height;
        }
        if (typeof video.stream.left !== 'undefined') {
            x = video.stream.left;
        }
        if (typeof video.stream.top !== 'undefined') {
            y = video.stream.top;
        }
        if (typeof video.stream.width !== 'undefined') {
            width = video.stream.width;
        }
        if (typeof video.stream.height !== 'undefined') {
            height = video.stream.height;
        }
        context.drawImage(video, x, y, width, height);
        if (typeof video.stream.onRender === 'function') {
            video.stream.onRender(context, x, y, width, height, idx);
        }
    }
    function getMixedStream() {
        isStopDrawingFrames = false;
        var mixedVideoStream = getMixedVideoStream();
        var mixedAudioStream = getMixedAudioStream();
        if (mixedAudioStream) {
            mixedAudioStream.getAudioTracks().forEach(function (track) {
                mixedVideoStream.addTrack(track);
            });
        }
        var fullcanvas;
        arrayOfMediaStreams.forEach(function (stream) {
            if (stream.fullcanvas) {
                fullcanvas = true;
            }
        });
        return mixedVideoStream;
    }
    function getMixedVideoStream() {
        resetVideoStreams();
        var capturedStream;
        if ('captureStream' in canvas) {
            capturedStream = canvas.captureStream();
        }
        else if ('mozCaptureStream' in canvas) {
            capturedStream = canvas.mozCaptureStream();
        }
        else if (!self.disableLogs) {
            console.error('Upgrade to latest Chrome or otherwise enable this flag: chrome://flags/#enable-experimental-web-platform-features');
        }
        var videoStream = new MediaStream();
        capturedStream.getVideoTracks().forEach(function (track) {
            videoStream.addTrack(track);
        });
        canvas.stream = videoStream;
        return videoStream;
    }
    function getMixedAudioStream() {
        // via: @pehrsons
        if (!Storage.AudioContextConstructor) {
            Storage.AudioContextConstructor = new Storage.AudioContext();
        }
        self.audioContext = Storage.AudioContextConstructor;
        self.audioSources = [];
        if (self.useGainNode === true) {
            self.gainNode = self.audioContext.createGain();
            self.gainNode.connect(self.audioContext.destination);
            self.gainNode.gain.value = 0; // don't hear self
        }
        var audioTracksLength = 0;
        arrayOfMediaStreams.forEach(function (stream) {
            if (!stream.getAudioTracks().length) {
                return;
            }
            audioTracksLength++;
            var audioSource = self.audioContext.createMediaStreamSource(stream);
            if (self.useGainNode === true) {
                audioSource.connect(self.gainNode);
            }
            self.audioSources.push(audioSource);
        });
        if (!audioTracksLength) {
            return;
        }
        self.audioDestination = self.audioContext.createMediaStreamDestination();
        self.audioSources.forEach(function (audioSource) {
            audioSource.connect(self.audioDestination);
        });
        return self.audioDestination.stream;
    }
    function getVideo(stream) {
        var video = document.createElement('video');
        if ('srcObject' in video) {
            video.srcObject = stream;
        }
        else {
            video.src = URL.createObjectURL(stream);
        }
        video.muted = true;
        video.volume = 0;
        video.width = stream.width || self.width || 360;
        video.height = stream.height || self.height || 240;
        video.play();
        return video;
    }
    this.appendStreams = function (streams) {
        if (!streams) {
            throw 'First parameter is required.';
        }
        if (!(streams instanceof Array)) {
            streams = [streams];
        }
        arrayOfMediaStreams.concat(streams);
        streams.forEach(function (stream) {
            if (stream.getVideoTracks().length) {
                var video = getVideo(stream);
                video.stream = stream;
                videos.push(video);
            }
            if (stream.getAudioTracks().length && self.audioContext) {
                var audioSource = self.audioContext.createMediaStreamSource(stream);
                audioSource.connect(self.audioDestination);
                self.audioSources.push(audioSource);
            }
        });
    };
    this.releaseStreams = function () {
        videos = [];
        isStopDrawingFrames = true;
        if (self.gainNode) {
            self.gainNode.disconnect();
            self.gainNode = null;
        }
        if (self.audioSources.length) {
            self.audioSources.forEach(function (source) {
                source.disconnect();
            });
            self.audioSources = [];
        }
        if (self.audioDestination) {
            self.audioDestination.disconnect();
            self.audioDestination = null;
        }
        self.audioContext = null;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (canvas.stream) {
            canvas.stream.stop();
            canvas.stream = null;
        }
    };
    this.resetVideoStreams = function (streams) {
        if (streams && !(streams instanceof Array)) {
            streams = [streams];
        }
        resetVideoStreams(streams);
    };
    function resetVideoStreams(streams) {
        videos = [];
        streams = streams || arrayOfMediaStreams;
        // via: @adrian-ber
        streams.forEach(function (stream) {
            if (!stream.getVideoTracks().length) {
                return;
            }
            var video = getVideo(stream);
            video.stream = stream;
            videos.push(video);
        });
    }
    // for debugging
    this.name = 'MultiStreamsMixer';
    this.toString = function () {
        return this.name;
    };
    this.getMixedStream = getMixedStream;
}
// _____________________________
// Cross-Browser-Declarations.js
var browserFakeUserAgent = 'Fake/5.0 (FakeOS) AppleWebKit/123 (KHTML, like Gecko) Fake/12.3.4567.89 Fake/123.45';
(function (that) {
    if (typeof window !== 'undefined') {
        return;
    }
    if (typeof window === 'undefined' && typeof global !== 'undefined') {
        global.navigator = {
            userAgent: browserFakeUserAgent,
            getUserMedia: function () { }
        };
        /*global window:true */
        that.window = global;
    }
    else if (typeof window === 'undefined') {
        // window = this;
    }
    if (typeof document === 'undefined') {
        /*global document:true */
        that.document = {};
        document.createElement = document.captureStream = document.mozCaptureStream = function () {
            return {};
        };
    }
    if (typeof location === 'undefined') {
        /*global location:true */
        that.location = {
            protocol: 'file:',
            href: '',
            hash: ''
        };
    }
    if (typeof screen === 'undefined') {
        /*global screen:true */
        that.screen = {
            width: 0,
            height: 0
        };
    }
})(typeof global !== 'undefined' ? global : window);
// WebAudio API representer
var AudioContext = window.AudioContext;
if (typeof AudioContext === 'undefined') {
    if (typeof webkitAudioContext !== 'undefined') {
        /*global AudioContext:true */
        AudioContext = webkitAudioContext;
    }
    if (typeof mozAudioContext !== 'undefined') {
        /*global AudioContext:true */
        AudioContext = mozAudioContext;
    }
}
if (typeof window === 'undefined') {
    /*jshint -W020 */
    window = {};
}
// WebAudio API representer
var AudioContext = window.AudioContext;
if (typeof AudioContext === 'undefined') {
    if (typeof webkitAudioContext !== 'undefined') {
        /*global AudioContext:true */
        AudioContext = webkitAudioContext;
    }
    if (typeof mozAudioContext !== 'undefined') {
        /*global AudioContext:true */
        AudioContext = mozAudioContext;
    }
}
/*jshint -W079 */
var URL = window.URL;
if (typeof URL === 'undefined' && typeof webkitURL !== 'undefined') {
    /*global URL:true */
    URL = webkitURL;
}
if (typeof navigator !== 'undefined') {
    if (typeof navigator.webkitGetUserMedia !== 'undefined') {
        navigator.getUserMedia = navigator.webkitGetUserMedia;
    }
    if (typeof navigator.mozGetUserMedia !== 'undefined') {
        navigator.getUserMedia = navigator.mozGetUserMedia;
    }
}
else {
    navigator = {
        getUserMedia: function () { },
        userAgent: browserFakeUserAgent
    };
}
var IsEdge = navigator.userAgent.indexOf('Edge') !== -1 && (!!navigator.msSaveBlob || !!navigator.msSaveOrOpenBlob);
var IsOpera = false;
if (typeof opera !== 'undefined' && navigator.userAgent && navigator.userAgent.indexOf('OPR/') !== -1) {
    IsOpera = true;
}
var IsChrome = !IsEdge && !IsEdge && !!navigator.webkitGetUserMedia;
var MediaStream = window.MediaStream;
if (typeof MediaStream === 'undefined' && typeof webkitMediaStream !== 'undefined') {
    MediaStream = webkitMediaStream;
}
/*global MediaStream:true */
if (typeof MediaStream !== 'undefined') {
    if (!('getVideoTracks' in MediaStream.prototype)) {
        MediaStream.prototype.getVideoTracks = function () {
            if (!this.getTracks) {
                return [];
            }
            var tracks = [];
            this.getTracks.forEach(function (track) {
                if (track.kind.toString().indexOf('video') !== -1) {
                    tracks.push(track);
                }
            });
            return tracks;
        };
        MediaStream.prototype.getAudioTracks = function () {
            if (!this.getTracks) {
                return [];
            }
            var tracks = [];
            this.getTracks.forEach(function (track) {
                if (track.kind.toString().indexOf('audio') !== -1) {
                    tracks.push(track);
                }
            });
            return tracks;
        };
    }
    if (!('stop' in MediaStream.prototype)) {
        MediaStream.prototype.stop = function () {
            this.getAudioTracks().forEach(function (track) {
                if (!!track.stop) {
                    track.stop();
                }
            });
            this.getVideoTracks().forEach(function (track) {
                if (!!track.stop) {
                    track.stop();
                }
            });
        };
    }
}
if (typeof location !== 'undefined') {
    if (location.href.indexOf('file:') === 0) {
        console.error('Please load this HTML file on HTTP or HTTPS.');
    }
}
// Merge all other data-types except "function"
function mergeProps(mergein, mergeto) {
    for (var t in mergeto) {
        if (typeof mergeto[t] !== 'function') {
            mergein[t] = mergeto[t];
        }
    }
    return mergein;
}
// "dropFirstFrame" has been added by Graham Roth
// https://github.com/gsroth
function dropFirstFrame(arr) {
    arr.shift();
    return arr;
}
/**
 * @param {Blob} file - File or Blob object. This parameter is required.
 * @param {string} fileName - Optional file name e.g. "Recorded-Video.webm"
 * @example
 * invokeSaveAsDialog(blob or file, [optional] fileName);
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 */
function invokeSaveAsDialog(file, fileName) {
    if (!file) {
        throw 'Blob object is required.';
    }
    if (!file.type) {
        try {
            file.type = 'video/webm';
        }
        catch (e) { }
    }
    var fileExtension = (file.type || 'video/webm').split('/')[1];
    if (fileName && fileName.indexOf('.') !== -1) {
        var splitted = fileName.split('.');
        fileName = splitted[0];
        fileExtension = splitted[1];
    }
    var fileFullName = (fileName || (Math.round(Math.random() * 9999999999) + 888888888)) + '.' + fileExtension;
    if (typeof navigator.msSaveOrOpenBlob !== 'undefined') {
        return navigator.msSaveOrOpenBlob(file, fileFullName);
    }
    else if (typeof navigator.msSaveBlob !== 'undefined') {
        return navigator.msSaveBlob(file, fileFullName);
    }
    var hyperlink = document.createElement('a');
    hyperlink.href = URL.createObjectURL(file);
    hyperlink.target = '_blank';
    hyperlink.download = fileFullName;
    if (!!navigator.mozGetUserMedia) {
        hyperlink.onclick = function () {
            (document.body || document.documentElement).removeChild(hyperlink);
        };
        (document.body || document.documentElement).appendChild(hyperlink);
    }
    var evt = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
    });
    hyperlink.dispatchEvent(evt);
    if (!navigator.mozGetUserMedia) {
        URL.revokeObjectURL(hyperlink.href);
    }
}
function bytesToSize(bytes) {
    var k = 1000;
    var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) {
        return '0 Bytes';
    }
    var i = parseInt(Math.floor(Math.log(bytes) / Math.log(k)), 10);
    return (bytes / Math.pow(k, i)).toPrecision(3) + ' ' + sizes[i];
}
// ______________ (used to handle stuff like http://goo.gl/xmE5eg) issue #129
// ObjectStore.js
var ObjectStore = {
    AudioContext: AudioContext
};
function isMediaRecorderCompatible() {
    var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
    var isChrome = !!window.chrome && !isOpera;
    var isFirefox = typeof window.InstallTrigger !== 'undefined';
    if (isFirefox) {
        return true;
    }
    if (!isChrome) {
        return false;
    }
    var nVer = navigator.appVersion;
    var nAgt = navigator.userAgent;
    var fullVersion = '' + parseFloat(navigator.appVersion);
    var majorVersion = parseInt(navigator.appVersion, 10);
    var nameOffset, verOffset, ix;
    if (isChrome) {
        verOffset = nAgt.indexOf('Chrome');
        fullVersion = nAgt.substring(verOffset + 7);
    }
    // trim the fullVersion string at semicolon/space if present
    if ((ix = fullVersion.indexOf(';')) !== -1) {
        fullVersion = fullVersion.substring(0, ix);
    }
    if ((ix = fullVersion.indexOf(' ')) !== -1) {
        fullVersion = fullVersion.substring(0, ix);
    }
    majorVersion = parseInt('' + fullVersion, 10);
    if (isNaN(majorVersion)) {
        fullVersion = '' + parseFloat(navigator.appVersion);
        majorVersion = parseInt(navigator.appVersion, 10);
    }
    return majorVersion >= 49;
}
// ==================
// MediaRecorder.js
/**
 * Implementation of https://dvcs.w3.org/hg/dap/raw-file/default/media-stream-capture/MediaRecorder.html
 * The MediaRecorder accepts a mediaStream as input source passed from UA. When recorder starts,
 * a MediaEncoder will be created and accept the mediaStream as input source.
 * Encoder will get the raw data by track data changes, encode it by selected MIME Type, then store the encoded in EncodedBufferCache object.
 * The encoded data will be extracted on every timeslice passed from Start function call or by RequestData function.
 * Thread model:
 * When the recorder starts, it creates a "Media Encoder" thread to read data from MediaEncoder object and store buffer in EncodedBufferCache object.
 * Also extract the encoded data and create blobs on every timeslice passed from start function or RequestData function called by UA.
 */
function MediaRecorderWrapper(mediaStream) {
    var self = this;
    /**
     * This method records MediaStream.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.start(5000);
     */
    this.start = function (timeSlice, __disableLogs) {
        this.timeSlice = timeSlice || 5000;
        if (!self.mimeType) {
            self.mimeType = 'video/webm';
        }
        if (self.mimeType.indexOf('audio') !== -1) {
            if (mediaStream.getVideoTracks().length && mediaStream.getAudioTracks().length) {
                var stream;
                if (!!navigator.mozGetUserMedia) {
                    stream = new MediaStream();
                    stream.addTrack(mediaStream.getAudioTracks()[0]);
                }
                else {
                    // webkitMediaStream
                    stream = new MediaStream(mediaStream.getAudioTracks());
                }
                mediaStream = stream;
            }
        }
        if (self.mimeType.indexOf('audio') !== -1) {
            self.mimeType = IsChrome ? 'audio/webm' : 'audio/ogg';
        }
        self.dontFireOnDataAvailableEvent = false;
        var recorderHints = {
            mimeType: self.mimeType
        };
        if (!self.disableLogs && !__disableLogs) {
            console.log('Passing following params over MediaRecorder API.', recorderHints);
        }
        if (mediaRecorder) {
            // mandatory to make sure Firefox doesn't fails to record streams 3-4 times without reloading the page.
            mediaRecorder = null;
        }
        if (IsChrome && !isMediaRecorderCompatible()) {
            // to support video-only recording on stable
            recorderHints = 'video/vp8';
        }
        // http://dxr.mozilla.org/mozilla-central/source/content/media/MediaRecorder.cpp
        // https://wiki.mozilla.org/Gecko:MediaRecorder
        // https://dvcs.w3.org/hg/dap/raw-file/default/media-stream-capture/MediaRecorder.html
        // starting a recording session; which will initiate "Reading Thread"
        // "Reading Thread" are used to prevent main-thread blocking scenarios
        try {
            mediaRecorder = new MediaRecorder(mediaStream, recorderHints);
        }
        catch (e) {
            // if someone passed NON_supported mimeType
            // or if Firefox on Android
            mediaRecorder = new MediaRecorder(mediaStream);
        }
        if ('canRecordMimeType' in mediaRecorder && mediaRecorder.canRecordMimeType(self.mimeType) === false) {
            if (!self.disableLogs) {
                console.warn('MediaRecorder API seems unable to record mimeType:', self.mimeType);
            }
        }
        // i.e. stop recording when <video> is paused by the user; and auto restart recording 
        // when video is resumed. E.g. yourStream.getVideoTracks()[0].muted = true; // it will auto-stop recording.
        if (self.ignoreMutedMedia === true) {
            mediaRecorder.ignoreMutedMedia = true;
        }
        var firedOnDataAvailableOnce = false;
        // Dispatching OnDataAvailable Handler
        mediaRecorder.ondataavailable = function (e) {
            // how to fix FF-corrupt-webm issues?
            // should we leave this?          e.data.size < 26800
            if (!e.data || !e.data.size || e.data.size < 26800 || firedOnDataAvailableOnce) {
                return;
            }
            firedOnDataAvailableOnce = true;
            var blob = self.getNativeBlob ? e.data : new Blob([e.data], {
                type: self.mimeType || 'video/webm'
            });
            self.ondataavailable(blob);
            // self.dontFireOnDataAvailableEvent = true;
            if (!!mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
            mediaRecorder = null;
            if (self.dontFireOnDataAvailableEvent) {
                return;
            }
            // record next interval
            self.start(timeSlice, '__disableLogs');
        };
        mediaRecorder.onerror = function (error) {
            if (!self.disableLogs) {
                if (error.name === 'InvalidState') {
                    console.error('The MediaRecorder is not in a state in which the proposed operation is allowed to be executed.');
                }
                else if (error.name === 'OutOfMemory') {
                    console.error('The UA has exhaused the available memory. User agents SHOULD provide as much additional information as possible in the message attribute.');
                }
                else if (error.name === 'IllegalStreamModification') {
                    console.error('A modification to the stream has occurred that makes it impossible to continue recording. An example would be the addition of a Track while recording is occurring. User agents SHOULD provide as much additional information as possible in the message attribute.');
                }
                else if (error.name === 'OtherRecordingError') {
                    console.error('Used for an fatal error other than those listed above. User agents SHOULD provide as much additional information as possible in the message attribute.');
                }
                else if (error.name === 'GenericError') {
                    console.error('The UA cannot provide the codec or recording option that has been requested.', error);
                }
                else {
                    console.error('MediaRecorder Error', error);
                }
            }
            // When the stream is "ended" set recording to 'inactive' 
            // and stop gathering data. Callers should not rely on 
            // exactness of the timeSlice value, especially 
            // if the timeSlice value is small. Callers should 
            // consider timeSlice as a minimum value
            if (!!mediaRecorder && mediaRecorder.state !== 'inactive' && mediaRecorder.state !== 'stopped') {
                mediaRecorder.stop();
            }
        };
        // void start(optional long mTimeSlice)
        // The interval of passing encoded data from EncodedBufferCache to onDataAvailable
        // handler. "mTimeSlice < 0" means Session object does not push encoded data to
        // onDataAvailable, instead, it passive wait the client side pull encoded data
        // by calling requestData API.
        try {
            mediaRecorder.start(3.6e+6);
        }
        catch (e) {
            mediaRecorder = null;
        }
        setTimeout(function () {
            if (!mediaRecorder) {
                return;
            }
            if (mediaRecorder.state === 'recording') {
                // "stop" method auto invokes "requestData"!
                mediaRecorder.requestData();
                // mediaRecorder.stop();
            }
        }, timeSlice);
        // Start recording. If timeSlice has been provided, mediaRecorder will
        // raise a dataavailable event containing the Blob of collected data on every timeSlice milliseconds.
        // If timeSlice isn't provided, UA should call the RequestData to obtain the Blob data, also set the mTimeSlice to zero.
    };
    /**
     * This method stops recording MediaStream.
     * @param {function} callback - Callback function, that is used to pass recorded blob back to the callee.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.stop(function(blob) {
     *     video.src = URL.createObjectURL(blob);
     * });
     */
    this.stop = function (callback) {
        if (!mediaRecorder) {
            return;
        }
        // mediaRecorder.state === 'recording' means that media recorder is associated with "session"
        // mediaRecorder.state === 'stopped' means that media recorder is detached from the "session" ... in this case; "session" will also be deleted.
        if (mediaRecorder.state === 'recording') {
            // "stop" method auto invokes "requestData"!
            mediaRecorder.requestData();
            setTimeout(function () {
                self.dontFireOnDataAvailableEvent = true;
                if (!!mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
                mediaRecorder = null;
                self.onstop();
            }, 2000);
        }
    };
    /**
     * This method pauses the recording process.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.pause();
     */
    this.pause = function () {
        if (!mediaRecorder) {
            return;
        }
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.pause();
        }
        this.dontFireOnDataAvailableEvent = true;
    };
    /**
     * The recorded blobs are passed over this event.
     * @event
     * @memberof MediaStreamRecorder
     * @example
     * recorder.ondataavailable = function(data) {};
     */
    this.ondataavailable = function (blob) {
        console.log('recorded-blob', blob);
    };
    /**
     * This method resumes the recording process.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.resume();
     */
    this.resume = function () {
        if (this.dontFireOnDataAvailableEvent) {
            this.dontFireOnDataAvailableEvent = false;
            var disableLogs = self.disableLogs;
            self.disableLogs = true;
            this.start(this.timeslice || 5000);
            self.disableLogs = disableLogs;
            return;
        }
        if (!mediaRecorder) {
            return;
        }
        if (mediaRecorder.state === 'paused') {
            mediaRecorder.resume();
        }
    };
    /**
     * This method resets currently recorded data.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.clearRecordedData();
     */
    this.clearRecordedData = function () {
        if (!mediaRecorder) {
            return;
        }
        this.pause();
        this.dontFireOnDataAvailableEvent = true;
        this.stop();
    };
    this.onstop = function () { };
    // Reference to "MediaRecorder" object
    var mediaRecorder;
    function isMediaStreamActive() {
        if ('active' in mediaStream) {
            if (!mediaStream.active) {
                return false;
            }
        }
        else if ('ended' in mediaStream) { // old hack
            if (mediaStream.ended) {
                return false;
            }
        }
        return true;
    }
    // this method checks if media stream is stopped
    // or any track is ended.
    (function looper() {
        if (!mediaRecorder) {
            return;
        }
        if (isMediaStreamActive() === false) {
            self.stop();
            return;
        }
        setTimeout(looper, 1000); // check every second
    })();
}
if (typeof MediaStreamRecorder !== 'undefined') {
    MediaStreamRecorder.MediaRecorderWrapper = MediaRecorderWrapper;
}
// ======================
// StereoAudioRecorder.js
function StereoAudioRecorder(mediaStream) {
    // void start(optional long timeSlice)
    // timestamp to fire "ondataavailable"
    this.start = function (timeSlice) {
        timeSlice = timeSlice || 1000;
        mediaRecorder = new StereoAudioRecorderHelper(mediaStream, this);
        mediaRecorder.record();
        timeout = setInterval(function () {
            mediaRecorder.requestData();
        }, timeSlice);
    };
    this.stop = function () {
        if (mediaRecorder) {
            mediaRecorder.stop();
            clearTimeout(timeout);
            this.onstop();
        }
    };
    this.pause = function () {
        if (!mediaRecorder) {
            return;
        }
        mediaRecorder.pause();
    };
    this.resume = function () {
        if (!mediaRecorder) {
            return;
        }
        mediaRecorder.resume();
    };
    this.ondataavailable = function () { };
    this.onstop = function () { };
    // Reference to "StereoAudioRecorder" object
    var mediaRecorder;
    var timeout;
}
if (typeof MediaStreamRecorder !== 'undefined') {
    MediaStreamRecorder.StereoAudioRecorder = StereoAudioRecorder;
}
// ============================
// StereoAudioRecorderHelper.js
// source code from: http://typedarray.org/wp-content/projects/WebAudioRecorder/script.js
function StereoAudioRecorderHelper(mediaStream, root) {
    // variables    
    var deviceSampleRate = 44100; // range: 22050 to 96000
    if (!ObjectStore.AudioContextConstructor) {
        ObjectStore.AudioContextConstructor = new ObjectStore.AudioContext();
    }
    // check device sample rate
    deviceSampleRate = ObjectStore.AudioContextConstructor.sampleRate;
    var leftchannel = [];
    var rightchannel = [];
    var scriptprocessornode;
    var recording = false;
    var recordingLength = 0;
    var volume;
    var audioInput;
    var sampleRate = root.sampleRate || deviceSampleRate;
    var mimeType = root.mimeType || 'audio/wav';
    var isPCM = mimeType.indexOf('audio/pcm') > -1;
    var context;
    var numChannels = root.audioChannels || 2;
    this.record = function () {
        recording = true;
        // reset the buffers for the new recording
        leftchannel.length = rightchannel.length = 0;
        recordingLength = 0;
    };
    this.requestData = function () {
        if (isPaused) {
            return;
        }
        if (recordingLength === 0) {
            requestDataInvoked = false;
            return;
        }
        requestDataInvoked = true;
        // clone stuff
        var internalLeftChannel = leftchannel.slice(0);
        var internalRightChannel = rightchannel.slice(0);
        var internalRecordingLength = recordingLength;
        // reset the buffers for the new recording
        leftchannel.length = rightchannel.length = [];
        recordingLength = 0;
        requestDataInvoked = false;
        // we flat the left and right channels down
        var leftBuffer = mergeBuffers(internalLeftChannel, internalRecordingLength);
        var interleaved = leftBuffer;
        // we interleave both channels together
        if (numChannels === 2) {
            var rightBuffer = mergeBuffers(internalRightChannel, internalRecordingLength); // bug fixed via #70,#71
            interleaved = interleave(leftBuffer, rightBuffer);
        }
        if (isPCM) {
            // our final binary blob
            var blob = new Blob([convertoFloat32ToInt16(interleaved)], {
                type: 'audio/pcm'
            });
            console.debug('audio recorded blob size:', bytesToSize(blob.size));
            root.ondataavailable(blob);
            return;
        }
        // we create our wav file
        var buffer = new ArrayBuffer(44 + interleaved.length * 2);
        var view = new DataView(buffer);
        // RIFF chunk descriptor
        writeUTFBytes(view, 0, 'RIFF');
        // -8 (via #97)
        view.setUint32(4, 44 + interleaved.length * 2 - 8, true);
        writeUTFBytes(view, 8, 'WAVE');
        // FMT sub-chunk
        writeUTFBytes(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        // stereo (2 channels)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true); // numChannels * 2 (via #71)
        view.setUint16(32, numChannels * 2, true);
        view.setUint16(34, 16, true);
        // data sub-chunk
        writeUTFBytes(view, 36, 'data');
        view.setUint32(40, interleaved.length * 2, true);
        // write the PCM samples
        var lng = interleaved.length;
        var index = 44;
        var volume = 1;
        for (var i = 0; i < lng; i++) {
            view.setInt16(index, interleaved[i] * (0x7FFF * volume), true);
            index += 2;
        }
        // our final binary blob
        var blob = new Blob([view], {
            type: 'audio/wav'
        });
        console.debug('audio recorded blob size:', bytesToSize(blob.size));
        root.ondataavailable(blob);
    };
    this.stop = function () {
        // we stop recording
        recording = false;
        this.requestData();
        audioInput.disconnect();
        this.onstop();
    };
    function interleave(leftChannel, rightChannel) {
        var length = leftChannel.length + rightChannel.length;
        var result = new Float32Array(length);
        var inputIndex = 0;
        for (var index = 0; index < length;) {
            result[index++] = leftChannel[inputIndex];
            result[index++] = rightChannel[inputIndex];
            inputIndex++;
        }
        return result;
    }
    function mergeBuffers(channelBuffer, recordingLength) {
        var result = new Float32Array(recordingLength);
        var offset = 0;
        var lng = channelBuffer.length;
        for (var i = 0; i < lng; i++) {
            var buffer = channelBuffer[i];
            result.set(buffer, offset);
            offset += buffer.length;
        }
        return result;
    }
    function writeUTFBytes(view, offset, string) {
        var lng = string.length;
        for (var i = 0; i < lng; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    function convertoFloat32ToInt16(buffer) {
        var l = buffer.length;
        var buf = new Int16Array(l);
        while (l--) {
            buf[l] = buffer[l] * 0xFFFF; //convert to 16 bit
        }
        return buf.buffer;
    }
    // creates the audio context
    var context = ObjectStore.AudioContextConstructor;
    // creates a gain node
    ObjectStore.VolumeGainNode = context.createGain();
    var volume = ObjectStore.VolumeGainNode;
    // creates an audio node from the microphone incoming stream
    ObjectStore.AudioInput = context.createMediaStreamSource(mediaStream);
    // creates an audio node from the microphone incoming stream
    var audioInput = ObjectStore.AudioInput;
    // connect the stream to the gain node
    audioInput.connect(volume);
    /* From the spec: This value controls how frequently the audioprocess event is
    dispatched and how many sample-frames need to be processed each call.
    Lower values for buffer size will result in a lower (better) latency.
    Higher values will be necessary to avoid audio breakup and glitches
    Legal values are 256, 512, 1024, 2048, 4096, 8192, and 16384.*/
    var bufferSize = root.bufferSize || 2048;
    if (root.bufferSize === 0) {
        bufferSize = 0;
    }
    if (context.createJavaScriptNode) {
        scriptprocessornode = context.createJavaScriptNode(bufferSize, numChannels, numChannels);
    }
    else if (context.createScriptProcessor) {
        scriptprocessornode = context.createScriptProcessor(bufferSize, numChannels, numChannels);
    }
    else {
        throw 'WebAudio API has no support on this browser.';
    }
    bufferSize = scriptprocessornode.bufferSize;
    console.debug('using audio buffer-size:', bufferSize);
    var requestDataInvoked = false;
    // sometimes "scriptprocessornode" disconnects from he destination-node
    // and there is no exception thrown in this case.
    // and obviously no further "ondataavailable" events will be emitted.
    // below global-scope variable is added to debug such unexpected but "rare" cases.
    window.scriptprocessornode = scriptprocessornode;
    if (numChannels === 1) {
        console.debug('All right-channels are skipped.');
    }
    var isPaused = false;
    this.pause = function () {
        isPaused = true;
    };
    this.resume = function () {
        isPaused = false;
    };
    this.onstop = function () { };
    // http://webaudio.github.io/web-audio-api/#the-scriptprocessornode-interface
    scriptprocessornode.onaudioprocess = function (e) {
        if (!recording || requestDataInvoked || isPaused) {
            return;
        }
        var left = e.inputBuffer.getChannelData(0);
        leftchannel.push(new Float32Array(left));
        if (numChannels === 2) {
            var right = e.inputBuffer.getChannelData(1);
            rightchannel.push(new Float32Array(right));
        }
        recordingLength += bufferSize;
    };
    volume.connect(scriptprocessornode);
    scriptprocessornode.connect(context.destination);
}
if (typeof MediaStreamRecorder !== 'undefined') {
    MediaStreamRecorder.StereoAudioRecorderHelper = StereoAudioRecorderHelper;
}
// ===================
// WhammyRecorder.js
function WhammyRecorder(mediaStream) {
    // void start(optional long timeSlice)
    // timestamp to fire "ondataavailable"
    this.start = function (timeSlice) {
        timeSlice = timeSlice || 1000;
        mediaRecorder = new WhammyRecorderHelper(mediaStream, this);
        for (var prop in this) {
            if (typeof this[prop] !== 'function') {
                mediaRecorder[prop] = this[prop];
            }
        }
        mediaRecorder.record();
        timeout = setInterval(function () {
            mediaRecorder.requestData();
        }, timeSlice);
    };
    this.stop = function () {
        if (mediaRecorder) {
            mediaRecorder.stop();
            clearTimeout(timeout);
            this.onstop();
        }
    };
    this.onstop = function () { };
    this.clearOldRecordedFrames = function () {
        if (mediaRecorder) {
            mediaRecorder.clearOldRecordedFrames();
        }
    };
    this.pause = function () {
        if (!mediaRecorder) {
            return;
        }
        mediaRecorder.pause();
    };
    this.resume = function () {
        if (!mediaRecorder) {
            return;
        }
        mediaRecorder.resume();
    };
    this.ondataavailable = function () { };
    // Reference to "WhammyRecorder" object
    var mediaRecorder;
    var timeout;
}
if (typeof MediaStreamRecorder !== 'undefined') {
    MediaStreamRecorder.WhammyRecorder = WhammyRecorder;
}
// ==========================
// WhammyRecorderHelper.js
function WhammyRecorderHelper(mediaStream, root) {
    this.record = function (timeSlice) {
        if (!this.width) {
            this.width = 320;
        }
        if (!this.height) {
            this.height = 240;
        }
        if (this.video && this.video instanceof HTMLVideoElement) {
            if (!this.width) {
                this.width = video.videoWidth || video.clientWidth || 320;
            }
            if (!this.height) {
                this.height = video.videoHeight || video.clientHeight || 240;
            }
        }
        if (!this.video) {
            this.video = {
                width: this.width,
                height: this.height
            };
        }
        if (!this.canvas || !this.canvas.width || !this.canvas.height) {
            this.canvas = {
                width: this.width,
                height: this.height
            };
        }
        canvas.width = this.canvas.width;
        canvas.height = this.canvas.height;
        // setting defaults
        if (this.video && this.video instanceof HTMLVideoElement) {
            this.isHTMLObject = true;
            video = this.video.cloneNode();
        }
        else {
            video = document.createElement('video');
            video.src = URL.createObjectURL(mediaStream);
            video.width = this.video.width;
            video.height = this.video.height;
        }
        video.muted = true;
        video.play();
        lastTime = new Date().getTime();
        whammy = new Whammy.Video(root.speed, root.quality);
        console.log('canvas resolutions', canvas.width, '*', canvas.height);
        console.log('video width/height', video.width || canvas.width, '*', video.height || canvas.height);
        drawFrames();
    };
    this.clearOldRecordedFrames = function () {
        whammy.frames = [];
    };
    var requestDataInvoked = false;
    this.requestData = function () {
        if (isPaused) {
            return;
        }
        if (!whammy.frames.length) {
            requestDataInvoked = false;
            return;
        }
        requestDataInvoked = true;
        // clone stuff
        var internalFrames = whammy.frames.slice(0);
        // reset the frames for the new recording
        whammy.frames = dropBlackFrames(internalFrames, -1);
        whammy.compile(function (whammyBlob) {
            root.ondataavailable(whammyBlob);
            console.debug('video recorded blob size:', bytesToSize(whammyBlob.size));
        });
        whammy.frames = [];
        requestDataInvoked = false;
    };
    var isOnStartedDrawingNonBlankFramesInvoked = false;
    function drawFrames() {
        if (isPaused) {
            lastTime = new Date().getTime();
            setTimeout(drawFrames, 500);
            return;
        }
        if (isStopDrawing) {
            return;
        }
        if (requestDataInvoked) {
            return setTimeout(drawFrames, 100);
        }
        var duration = new Date().getTime() - lastTime;
        if (!duration) {
            return drawFrames();
        }
        // via webrtc-experiment#206, by Jack i.e. @Seymourr
        lastTime = new Date().getTime();
        if (!self.isHTMLObject && video.paused) {
            video.play(); // Android
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (!isStopDrawing) {
            whammy.frames.push({
                duration: duration,
                image: canvas.toDataURL('image/webp')
            });
        }
        if (!isOnStartedDrawingNonBlankFramesInvoked && !isBlankFrame(whammy.frames[whammy.frames.length - 1])) {
            isOnStartedDrawingNonBlankFramesInvoked = true;
            root.onStartedDrawingNonBlankFrames();
        }
        setTimeout(drawFrames, 10);
    }
    var isStopDrawing = false;
    this.stop = function () {
        isStopDrawing = true;
        this.requestData();
        this.onstop();
    };
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var video;
    var lastTime;
    var whammy;
    var self = this;
    function isBlankFrame(frame, _pixTolerance, _frameTolerance) {
        var localCanvas = document.createElement('canvas');
        localCanvas.width = canvas.width;
        localCanvas.height = canvas.height;
        var context2d = localCanvas.getContext('2d');
        var sampleColor = {
            r: 0,
            g: 0,
            b: 0
        };
        var maxColorDifference = Math.sqrt(Math.pow(255, 2) +
            Math.pow(255, 2) +
            Math.pow(255, 2));
        var pixTolerance = _pixTolerance && _pixTolerance >= 0 && _pixTolerance <= 1 ? _pixTolerance : 0;
        var frameTolerance = _frameTolerance && _frameTolerance >= 0 && _frameTolerance <= 1 ? _frameTolerance : 0;
        var matchPixCount, endPixCheck, maxPixCount;
        var image = new Image();
        image.src = frame.image;
        context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
        var imageData = context2d.getImageData(0, 0, canvas.width, canvas.height);
        matchPixCount = 0;
        endPixCheck = imageData.data.length;
        maxPixCount = imageData.data.length / 4;
        for (var pix = 0; pix < endPixCheck; pix += 4) {
            var currentColor = {
                r: imageData.data[pix],
                g: imageData.data[pix + 1],
                b: imageData.data[pix + 2]
            };
            var colorDifference = Math.sqrt(Math.pow(currentColor.r - sampleColor.r, 2) +
                Math.pow(currentColor.g - sampleColor.g, 2) +
                Math.pow(currentColor.b - sampleColor.b, 2));
            // difference in color it is difference in color vectors (r1,g1,b1) <=> (r2,g2,b2)
            if (colorDifference <= maxColorDifference * pixTolerance) {
                matchPixCount++;
            }
        }
        if (maxPixCount - matchPixCount <= maxPixCount * frameTolerance) {
            return false;
        }
        else {
            return true;
        }
    }
    function dropBlackFrames(_frames, _framesToCheck, _pixTolerance, _frameTolerance) {
        var localCanvas = document.createElement('canvas');
        localCanvas.width = canvas.width;
        localCanvas.height = canvas.height;
        var context2d = localCanvas.getContext('2d');
        var resultFrames = [];
        var checkUntilNotBlack = _framesToCheck === -1;
        var endCheckFrame = (_framesToCheck && _framesToCheck > 0 && _framesToCheck <= _frames.length) ?
            _framesToCheck : _frames.length;
        var sampleColor = {
            r: 0,
            g: 0,
            b: 0
        };
        var maxColorDifference = Math.sqrt(Math.pow(255, 2) +
            Math.pow(255, 2) +
            Math.pow(255, 2));
        var pixTolerance = _pixTolerance && _pixTolerance >= 0 && _pixTolerance <= 1 ? _pixTolerance : 0;
        var frameTolerance = _frameTolerance && _frameTolerance >= 0 && _frameTolerance <= 1 ? _frameTolerance : 0;
        var doNotCheckNext = false;
        for (var f = 0; f < endCheckFrame; f++) {
            var matchPixCount, endPixCheck, maxPixCount;
            if (!doNotCheckNext) {
                var image = new Image();
                image.src = _frames[f].image;
                context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
                var imageData = context2d.getImageData(0, 0, canvas.width, canvas.height);
                matchPixCount = 0;
                endPixCheck = imageData.data.length;
                maxPixCount = imageData.data.length / 4;
                for (var pix = 0; pix < endPixCheck; pix += 4) {
                    var currentColor = {
                        r: imageData.data[pix],
                        g: imageData.data[pix + 1],
                        b: imageData.data[pix + 2]
                    };
                    var colorDifference = Math.sqrt(Math.pow(currentColor.r - sampleColor.r, 2) +
                        Math.pow(currentColor.g - sampleColor.g, 2) +
                        Math.pow(currentColor.b - sampleColor.b, 2));
                    // difference in color it is difference in color vectors (r1,g1,b1) <=> (r2,g2,b2)
                    if (colorDifference <= maxColorDifference * pixTolerance) {
                        matchPixCount++;
                    }
                }
            }
            if (!doNotCheckNext && maxPixCount - matchPixCount <= maxPixCount * frameTolerance) {
                // console.log('removed black frame : ' + f + ' ; frame duration ' + _frames[f].duration);
            }
            else {
                // console.log('frame is passed : ' + f);
                if (checkUntilNotBlack) {
                    doNotCheckNext = true;
                }
                resultFrames.push(_frames[f]);
            }
        }
        resultFrames = resultFrames.concat(_frames.slice(endCheckFrame));
        if (resultFrames.length <= 0) {
            // at least one last frame should be available for next manipulation
            // if total duration of all frames will be < 1000 than ffmpeg doesn't work well...
            resultFrames.push(_frames[_frames.length - 1]);
        }
        return resultFrames;
    }
    var isPaused = false;
    this.pause = function () {
        isPaused = true;
    };
    this.resume = function () {
        isPaused = false;
    };
    this.onstop = function () { };
}
if (typeof MediaStreamRecorder !== 'undefined') {
    MediaStreamRecorder.WhammyRecorderHelper = WhammyRecorderHelper;
}
// --------------
// GifRecorder.js
function GifRecorder(mediaStream) {
    if (typeof GIFEncoder === 'undefined') {
        throw 'Please link: https://cdn.webrtc-experiment.com/gif-recorder.js';
    }
    // void start(optional long timeSlice)
    // timestamp to fire "ondataavailable"
    this.start = function (timeSlice) {
        timeSlice = timeSlice || 1000;
        var imageWidth = this.videoWidth || 320;
        var imageHeight = this.videoHeight || 240;
        canvas.width = video.width = imageWidth;
        canvas.height = video.height = imageHeight;
        // external library to record as GIF images
        gifEncoder = new GIFEncoder();
        // void setRepeat(int iter)
        // Sets the number of times the set of GIF frames should be played.
        // Default is 1; 0 means play indefinitely.
        gifEncoder.setRepeat(0);
        // void setFrameRate(Number fps)
        // Sets frame rate in frames per second.
        // Equivalent to setDelay(1000/fps).
        // Using "setDelay" instead of "setFrameRate"
        gifEncoder.setDelay(this.frameRate || this.speed || 200);
        // void setQuality(int quality)
        // Sets quality of color quantization (conversion of images to the
        // maximum 256 colors allowed by the GIF specification).
        // Lower values (minimum = 1) produce better colors,
        // but slow processing significantly. 10 is the default,
        // and produces good color mapping at reasonable speeds.
        // Values greater than 20 do not yield significant improvements in speed.
        gifEncoder.setQuality(this.quality || 1);
        // Boolean start()
        // This writes the GIF Header and returns false if it fails.
        gifEncoder.start();
        startTime = Date.now();
        function drawVideoFrame(time) {
            if (isPaused) {
                setTimeout(drawVideoFrame, 500, time);
                return;
            }
            lastAnimationFrame = requestAnimationFrame(drawVideoFrame);
            if (typeof lastFrameTime === undefined) {
                lastFrameTime = time;
            }
            // ~10 fps
            if (time - lastFrameTime < 90) {
                return;
            }
            if (video.paused) {
                video.play(); // Android
            }
            context.drawImage(video, 0, 0, imageWidth, imageHeight);
            gifEncoder.addFrame(context);
            // console.log('Recording...' + Math.round((Date.now() - startTime) / 1000) + 's');
            // console.log("fps: ", 1000 / (time - lastFrameTime));
            lastFrameTime = time;
        }
        lastAnimationFrame = requestAnimationFrame(drawVideoFrame);
        timeout = setTimeout(doneRecording, timeSlice);
    };
    function doneRecording() {
        endTime = Date.now();
        var gifBlob = new Blob([new Uint8Array(gifEncoder.stream().bin)], {
            type: 'image/gif'
        });
        self.ondataavailable(gifBlob);
        // todo: find a way to clear old recorded blobs
        gifEncoder.stream().bin = [];
    }
    this.stop = function () {
        if (lastAnimationFrame) {
            cancelAnimationFrame(lastAnimationFrame);
            clearTimeout(timeout);
            doneRecording();
            this.onstop();
        }
    };
    this.onstop = function () { };
    var isPaused = false;
    this.pause = function () {
        isPaused = true;
    };
    this.resume = function () {
        isPaused = false;
    };
    this.ondataavailable = function () { };
    this.onstop = function () { };
    // Reference to itself
    var self = this;
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.src = URL.createObjectURL(mediaStream);
    video.play();
    var lastAnimationFrame = null;
    var startTime, endTime, lastFrameTime;
    var gifEncoder;
    var timeout;
}
if (typeof MediaStreamRecorder !== 'undefined') {
    MediaStreamRecorder.GifRecorder = GifRecorder;
}
// https://github.com/antimatter15/whammy/blob/master/LICENSE
// _________
// Whammy.js
// todo: Firefox now supports webp for webm containers!
// their MediaRecorder implementation works well!
// should we provide an option to record via Whammy.js or MediaRecorder API is a better solution?
/**
 * Whammy is a standalone class used by {@link RecordRTC} to bring video recording in Chrome. It is written by {@link https://github.com/antimatter15|antimatter15}
 * @summary A real time javascript webm encoder based on a canvas hack.
 * @typedef Whammy
 * @class
 * @example
 * var recorder = new Whammy().Video(15);
 * recorder.add(context || canvas || dataURL);
 * var output = recorder.compile();
 */
var Whammy = (function () {
    // a more abstract-ish API
    function WhammyVideo(duration, quality) {
        this.frames = [];
        if (!duration) {
            duration = 1;
        }
        this.duration = 1000 / duration;
        this.quality = quality || 0.8;
    }
    /**
     * Pass Canvas or Context or image/webp(string) to {@link Whammy} encoder.
     * @method
     * @memberof Whammy
     * @example
     * recorder = new Whammy().Video(0.8, 100);
     * recorder.add(canvas || context || 'image/webp');
     * @param {string} frame - Canvas || Context || image/webp
     * @param {number} duration - Stick a duration (in milliseconds)
     */
    WhammyVideo.prototype.add = function (frame, duration) {
        if ('canvas' in frame) { //CanvasRenderingContext2D
            frame = frame.canvas;
        }
        if ('toDataURL' in frame) {
            frame = frame.toDataURL('image/webp', this.quality);
        }
        if (!(/^data:image\/webp;base64,/ig).test(frame)) {
            throw 'Input must be formatted properly as a base64 encoded DataURI of type image/webp';
        }
        this.frames.push({
            image: frame,
            duration: duration || this.duration
        });
    };
    function processInWebWorker(_function) {
        var blob = URL.createObjectURL(new Blob([_function.toString(),
            'this.onmessage =  function (e) {' + _function.name + '(e.data);}'
        ], {
            type: 'application/javascript'
        }));
        var worker = new Worker(blob);
        URL.revokeObjectURL(blob);
        return worker;
    }
    function whammyInWebWorker(frames) {
        function ArrayToWebM(frames) {
            var info = checkFrames(frames);
            if (!info) {
                return [];
            }
            var clusterMaxDuration = 30000;
            var EBML = [{
                    'id': 0x1a45dfa3,
                    'data': [{
                            'data': 1,
                            'id': 0x4286 // EBMLVersion
                        }, {
                            'data': 1,
                            'id': 0x42f7 // EBMLReadVersion
                        }, {
                            'data': 4,
                            'id': 0x42f2 // EBMLMaxIDLength
                        }, {
                            'data': 8,
                            'id': 0x42f3 // EBMLMaxSizeLength
                        }, {
                            'data': 'webm',
                            'id': 0x4282 // DocType
                        }, {
                            'data': 2,
                            'id': 0x4287 // DocTypeVersion
                        }, {
                            'data': 2,
                            'id': 0x4285 // DocTypeReadVersion
                        }]
                }, {
                    'id': 0x18538067,
                    'data': [{
                            'id': 0x1549a966,
                            'data': [{
                                    'data': 1e6,
                                    'id': 0x2ad7b1 // TimecodeScale
                                }, {
                                    'data': 'whammy',
                                    'id': 0x4d80 // MuxingApp
                                }, {
                                    'data': 'whammy',
                                    'id': 0x5741 // WritingApp
                                }, {
                                    'data': doubleToString(info.duration),
                                    'id': 0x4489 // Duration
                                }]
                        }, {
                            'id': 0x1654ae6b,
                            'data': [{
                                    'id': 0xae,
                                    'data': [{
                                            'data': 1,
                                            'id': 0xd7 // TrackNumber
                                        }, {
                                            'data': 1,
                                            'id': 0x73c5 // TrackUID
                                        }, {
                                            'data': 0,
                                            'id': 0x9c // FlagLacing
                                        }, {
                                            'data': 'und',
                                            'id': 0x22b59c // Language
                                        }, {
                                            'data': 'V_VP8',
                                            'id': 0x86 // CodecID
                                        }, {
                                            'data': 'VP8',
                                            'id': 0x258688 // CodecName
                                        }, {
                                            'data': 1,
                                            'id': 0x83 // TrackType
                                        }, {
                                            'id': 0xe0,
                                            'data': [{
                                                    'data': info.width,
                                                    'id': 0xb0 // PixelWidth
                                                }, {
                                                    'data': info.height,
                                                    'id': 0xba // PixelHeight
                                                }]
                                        }]
                                }]
                        }]
                }];
            //Generate clusters (max duration)
            var frameNumber = 0;
            var clusterTimecode = 0;
            while (frameNumber < frames.length) {
                var clusterFrames = [];
                var clusterDuration = 0;
                do {
                    clusterFrames.push(frames[frameNumber]);
                    clusterDuration += frames[frameNumber].duration;
                    frameNumber++;
                } while (frameNumber < frames.length && clusterDuration < clusterMaxDuration);
                var clusterCounter = 0;
                var cluster = {
                    'id': 0x1f43b675,
                    'data': getClusterData(clusterTimecode, clusterCounter, clusterFrames)
                }; //Add cluster to segment
                EBML[1].data.push(cluster);
                clusterTimecode += clusterDuration;
            }
            return generateEBML(EBML);
        }
        function getClusterData(clusterTimecode, clusterCounter, clusterFrames) {
            return [{
                    'data': clusterTimecode,
                    'id': 0xe7 // Timecode
                }].concat(clusterFrames.map(function (webp) {
                var block = makeSimpleBlock({
                    discardable: 0,
                    frame: webp.data.slice(4),
                    invisible: 0,
                    keyframe: 1,
                    lacing: 0,
                    trackNum: 1,
                    timecode: Math.round(clusterCounter)
                });
                clusterCounter += webp.duration;
                return {
                    data: block,
                    id: 0xa3
                };
            }));
        }
        // sums the lengths of all the frames and gets the duration
        function checkFrames(frames) {
            if (!frames[0]) {
                postMessage({
                    error: 'Something went wrong. Maybe WebP format is not supported in the current browser.'
                });
                return;
            }
            var width = frames[0].width, height = frames[0].height, duration = frames[0].duration;
            for (var i = 1; i < frames.length; i++) {
                duration += frames[i].duration;
            }
            return {
                duration: duration,
                width: width,
                height: height
            };
        }
        function numToBuffer(num) {
            var parts = [];
            while (num > 0) {
                parts.push(num & 0xff);
                num = num >> 8;
            }
            return new Uint8Array(parts.reverse());
        }
        function strToBuffer(str) {
            return new Uint8Array(str.split('').map(function (e) {
                return e.charCodeAt(0);
            }));
        }
        function bitsToBuffer(bits) {
            var data = [];
            var pad = (bits.length % 8) ? (new Array(1 + 8 - (bits.length % 8))).join('0') : '';
            bits = pad + bits;
            for (var i = 0; i < bits.length; i += 8) {
                data.push(parseInt(bits.substr(i, 8), 2));
            }
            return new Uint8Array(data);
        }
        function generateEBML(json) {
            var ebml = [];
            for (var i = 0; i < json.length; i++) {
                var data = json[i].data;
                if (typeof data === 'object') {
                    data = generateEBML(data);
                }
                if (typeof data === 'number') {
                    data = bitsToBuffer(data.toString(2));
                }
                if (typeof data === 'string') {
                    data = strToBuffer(data);
                }
                var len = data.size || data.byteLength || data.length;
                var zeroes = Math.ceil(Math.ceil(Math.log(len) / Math.log(2)) / 8);
                var sizeToString = len.toString(2);
                var padded = (new Array((zeroes * 7 + 7 + 1) - sizeToString.length)).join('0') + sizeToString;
                var size = (new Array(zeroes)).join('0') + '1' + padded;
                ebml.push(numToBuffer(json[i].id));
                ebml.push(bitsToBuffer(size));
                ebml.push(data);
            }
            return new Blob(ebml, {
                type: 'video/webm'
            });
        }
        function toBinStrOld(bits) {
            var data = '';
            var pad = (bits.length % 8) ? (new Array(1 + 8 - (bits.length % 8))).join('0') : '';
            bits = pad + bits;
            for (var i = 0; i < bits.length; i += 8) {
                data += String.fromCharCode(parseInt(bits.substr(i, 8), 2));
            }
            return data;
        }
        function makeSimpleBlock(data) {
            var flags = 0;
            if (data.keyframe) {
                flags |= 128;
            }
            if (data.invisible) {
                flags |= 8;
            }
            if (data.lacing) {
                flags |= (data.lacing << 1);
            }
            if (data.discardable) {
                flags |= 1;
            }
            if (data.trackNum > 127) {
                throw 'TrackNumber > 127 not supported';
            }
            var out = [data.trackNum | 0x80, data.timecode >> 8, data.timecode & 0xff, flags].map(function (e) {
                return String.fromCharCode(e);
            }).join('') + data.frame;
            return out;
        }
        function parseWebP(riff) {
            var VP8 = riff.RIFF[0].WEBP[0];
            var frameStart = VP8.indexOf('\x9d\x01\x2a'); // A VP8 keyframe starts with the 0x9d012a header
            for (var i = 0, c = []; i < 4; i++) {
                c[i] = VP8.charCodeAt(frameStart + 3 + i);
            }
            var width, height, tmp;
            //the code below is literally copied verbatim from the bitstream spec
            tmp = (c[1] << 8) | c[0];
            width = tmp & 0x3FFF;
            tmp = (c[3] << 8) | c[2];
            height = tmp & 0x3FFF;
            return {
                width: width,
                height: height,
                data: VP8,
                riff: riff
            };
        }
        function getStrLength(string, offset) {
            return parseInt(string.substr(offset + 4, 4).split('').map(function (i) {
                var unpadded = i.charCodeAt(0).toString(2);
                return (new Array(8 - unpadded.length + 1)).join('0') + unpadded;
            }).join(''), 2);
        }
        function parseRIFF(string) {
            var offset = 0;
            var chunks = {};
            while (offset < string.length) {
                var id = string.substr(offset, 4);
                var len = getStrLength(string, offset);
                var data = string.substr(offset + 4 + 4, len);
                offset += 4 + 4 + len;
                chunks[id] = chunks[id] || [];
                if (id === 'RIFF' || id === 'LIST') {
                    chunks[id].push(parseRIFF(data));
                }
                else {
                    chunks[id].push(data);
                }
            }
            return chunks;
        }
        function doubleToString(num) {
            return [].slice.call(new Uint8Array((new Float64Array([num])).buffer), 0).map(function (e) {
                return String.fromCharCode(e);
            }).reverse().join('');
        }
        var webm = new ArrayToWebM(frames.map(function (frame) {
            var webp = parseWebP(parseRIFF(atob(frame.image.slice(23))));
            webp.duration = frame.duration;
            return webp;
        }));
        postMessage(webm);
    }
    /**
     * Encodes frames in WebM container. It uses WebWorkinvoke to invoke 'ArrayToWebM' method.
     * @param {function} callback - Callback function, that is used to pass recorded blob back to the callee.
     * @method
     * @memberof Whammy
     * @example
     * recorder = new Whammy().Video(0.8, 100);
     * recorder.compile(function(blob) {
     *    // blob.size - blob.type
     * });
     */
    WhammyVideo.prototype.compile = function (callback) {
        var webWorker = processInWebWorker(whammyInWebWorker);
        webWorker.onmessage = function (event) {
            if (event.data.error) {
                console.error(event.data.error);
                return;
            }
            callback(event.data);
        };
        webWorker.postMessage(this.frames);
    };
    return {
        /**
         * A more abstract-ish API.
         * @method
         * @memberof Whammy
         * @example
         * recorder = new Whammy().Video(0.8, 100);
         * @param {?number} speed - 0.8
         * @param {?number} quality - 100
         */
        Video: WhammyVideo
    };
})();
if (typeof MediaStreamRecorder !== 'undefined') {
    MediaStreamRecorder.Whammy = Whammy;
}
// Last time updated at Nov 18, 2014, 08:32:23
// Latest file can be found here: https://cdn.webrtc-experiment.com/ConcatenateBlobs.js
// Muaz Khan    - www.MuazKhan.com
// MIT License  - www.WebRTC-Experiment.com/licence
// Source Code  - https://github.com/muaz-khan/ConcatenateBlobs
// Demo         - https://www.WebRTC-Experiment.com/ConcatenateBlobs/
// ___________________
// ConcatenateBlobs.js
// Simply pass array of blobs.
// This javascript library will concatenate all blobs in single "Blob" object.
(function () {
    window.ConcatenateBlobs = function (blobs, type, callback) {
        var buffers = [];
        var index = 0;
        function readAsArrayBuffer() {
            if (!blobs[index]) {
                return concatenateBuffers();
            }
            var reader = new FileReader();
            reader.onload = function (event) {
                buffers.push(event.target.result);
                index++;
                readAsArrayBuffer();
            };
            reader.readAsArrayBuffer(blobs[index]);
        }
        readAsArrayBuffer();
        function concatenateBuffers() {
            var byteLength = 0;
            buffers.forEach(function (buffer) {
                byteLength += buffer.byteLength;
            });
            var tmp = new Uint16Array(byteLength);
            var lastOffset = 0;
            buffers.forEach(function (buffer) {
                // BYTES_PER_ELEMENT == 2 for Uint16Array
                var reusableByteLength = buffer.byteLength;
                if (reusableByteLength % 2 != 0) {
                    buffer = buffer.slice(0, reusableByteLength - 1);
                }
                tmp.set(new Uint16Array(buffer), lastOffset);
                lastOffset += reusableByteLength;
            });
            var blob = new Blob([tmp.buffer], {
                type: type
            });
            callback(blob);
        }
    };
})();
// https://github.com/streamproc/MediaStreamRecorder/issues/42
if (typeof module !== 'undefined' /* && !!module.exports*/) {
    module.exports = MediaStreamRecorder;
}
if (typeof define === 'function' && define.amd) {
    define('MediaStreamRecorder', [], function () {
        return MediaStreamRecorder;
    });
}
// Last time updated: 2017-09-20 11:19:01 AM UTC
// ________________________
// MultiStreamsMixer v1.0.3
// Open-Sourced: https://github.com/muaz-khan/MultiStreamsMixer
// --------------------------------------------------
// Muaz Khan     - www.MuazKhan.com
// MIT License   - www.WebRTC-Experiment.com/licence
// --------------------------------------------------
function MultiStreamsMixer(arrayOfMediaStreams) {
    // requires: chrome://flags/#enable-experimental-web-platform-features
    var videos = [];
    var isStopDrawingFrames = false;
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    canvas.style = 'opacity:0;position:absolute;z-index:-1;top: -100000000;left:-1000000000; margin-top:-1000000000;margin-left:-1000000000;';
    (document.body || document.documentElement).appendChild(canvas);
    this.disableLogs = false;
    this.frameInterval = 10;
    this.width = 360;
    this.height = 240;
    // use gain node to prevent echo
    this.useGainNode = true;
    var self = this;
    // _____________________________
    // Cross-Browser-Declarations.js
    // WebAudio API representer
    var AudioContext = window.AudioContext;
    if (typeof AudioContext === 'undefined') {
        if (typeof webkitAudioContext !== 'undefined') {
            /*global AudioContext:true */
            AudioContext = webkitAudioContext;
        }
        if (typeof mozAudioContext !== 'undefined') {
            /*global AudioContext:true */
            AudioContext = mozAudioContext;
        }
    }
    /*jshint -W079 */
    var URL = window.URL;
    if (typeof URL === 'undefined' && typeof webkitURL !== 'undefined') {
        /*global URL:true */
        URL = webkitURL;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.getUserMedia === 'undefined') { // maybe window.navigator?
        if (typeof navigator.webkitGetUserMedia !== 'undefined') {
            navigator.getUserMedia = navigator.webkitGetUserMedia;
        }
        if (typeof navigator.mozGetUserMedia !== 'undefined') {
            navigator.getUserMedia = navigator.mozGetUserMedia;
        }
    }
    var MediaStream = window.MediaStream;
    if (typeof MediaStream === 'undefined' && typeof webkitMediaStream !== 'undefined') {
        MediaStream = webkitMediaStream;
    }
    /*global MediaStream:true */
    if (typeof MediaStream !== 'undefined') {
        if (!('getVideoTracks' in MediaStream.prototype)) {
            MediaStream.prototype.getVideoTracks = function () {
                if (!this.getTracks) {
                    return [];
                }
                var tracks = [];
                this.getTracks.forEach(function (track) {
                    if (track.kind.toString().indexOf('video') !== -1) {
                        tracks.push(track);
                    }
                });
                return tracks;
            };
            MediaStream.prototype.getAudioTracks = function () {
                if (!this.getTracks) {
                    return [];
                }
                var tracks = [];
                this.getTracks.forEach(function (track) {
                    if (track.kind.toString().indexOf('audio') !== -1) {
                        tracks.push(track);
                    }
                });
                return tracks;
            };
        }
        // override "stop" method for all browsers
        if (typeof MediaStream.prototype.stop === 'undefined') {
            MediaStream.prototype.stop = function () {
                this.getTracks().forEach(function (track) {
                    track.stop();
                });
            };
        }
    }
    var Storage = {};
    if (typeof AudioContext !== 'undefined') {
        Storage.AudioContext = AudioContext;
    }
    else if (typeof webkitAudioContext !== 'undefined') {
        Storage.AudioContext = webkitAudioContext;
    }
    this.startDrawingFrames = function () {
        drawVideosToCanvas();
    };
    function drawVideosToCanvas() {
        if (isStopDrawingFrames) {
            return;
        }
        var videosLength = videos.length;
        var fullcanvas = false;
        var remaining = [];
        videos.forEach(function (video) {
            if (!video.stream) {
                video.stream = {};
            }
            if (video.stream.fullcanvas) {
                fullcanvas = video;
            }
            else {
                remaining.push(video);
            }
        });
        if (fullcanvas) {
            canvas.width = fullcanvas.stream.width;
            canvas.height = fullcanvas.stream.height;
        }
        else if (remaining.length) {
            canvas.width = videosLength > 1 ? remaining[0].width * 2 : remaining[0].width;
            var height = 1;
            if (videosLength === 3 || videosLength === 4) {
                height = 2;
            }
            if (videosLength === 5 || videosLength === 6) {
                height = 3;
            }
            if (videosLength === 7 || videosLength === 8) {
                height = 4;
            }
            if (videosLength === 9 || videosLength === 10) {
                height = 5;
            }
            canvas.height = remaining[0].height * height;
        }
        else {
            canvas.width = self.width || 360;
            canvas.height = self.height || 240;
        }
        if (fullcanvas && fullcanvas instanceof HTMLVideoElement) {
            drawImage(fullcanvas);
        }
        remaining.forEach(function (video, idx) {
            drawImage(video, idx);
        });
        setTimeout(drawVideosToCanvas, self.frameInterval);
    }
    function drawImage(video, idx) {
        if (isStopDrawingFrames) {
            return;
        }
        var x = 0;
        var y = 0;
        var width = video.width;
        var height = video.height;
        if (idx === 1) {
            x = video.width;
        }
        if (idx === 2) {
            y = video.height;
        }
        if (idx === 3) {
            x = video.width;
            y = video.height;
        }
        if (idx === 4) {
            y = video.height * 2;
        }
        if (idx === 5) {
            x = video.width;
            y = video.height * 2;
        }
        if (idx === 6) {
            y = video.height * 3;
        }
        if (idx === 7) {
            x = video.width;
            y = video.height * 3;
        }
        if (typeof video.stream.left !== 'undefined') {
            x = video.stream.left;
        }
        if (typeof video.stream.top !== 'undefined') {
            y = video.stream.top;
        }
        if (typeof video.stream.width !== 'undefined') {
            width = video.stream.width;
        }
        if (typeof video.stream.height !== 'undefined') {
            height = video.stream.height;
        }
        context.drawImage(video, x, y, width, height);
        if (typeof video.stream.onRender === 'function') {
            video.stream.onRender(context, x, y, width, height, idx);
        }
    }
    function getMixedStream() {
        isStopDrawingFrames = false;
        var mixedVideoStream = getMixedVideoStream();
        var mixedAudioStream = getMixedAudioStream();
        if (mixedAudioStream) {
            mixedAudioStream.getAudioTracks().forEach(function (track) {
                mixedVideoStream.addTrack(track);
            });
        }
        var fullcanvas;
        arrayOfMediaStreams.forEach(function (stream) {
            if (stream.fullcanvas) {
                fullcanvas = true;
            }
        });
        return mixedVideoStream;
    }
    function getMixedVideoStream() {
        resetVideoStreams();
        var capturedStream;
        if ('captureStream' in canvas) {
            capturedStream = canvas.captureStream();
        }
        else if ('mozCaptureStream' in canvas) {
            capturedStream = canvas.mozCaptureStream();
        }
        else if (!self.disableLogs) {
            console.error('Upgrade to latest Chrome or otherwise enable this flag: chrome://flags/#enable-experimental-web-platform-features');
        }
        var videoStream = new MediaStream();
        capturedStream.getVideoTracks().forEach(function (track) {
            videoStream.addTrack(track);
        });
        canvas.stream = videoStream;
        return videoStream;
    }
    function getMixedAudioStream() {
        // via: @pehrsons
        if (!Storage.AudioContextConstructor) {
            Storage.AudioContextConstructor = new Storage.AudioContext();
        }
        self.audioContext = Storage.AudioContextConstructor;
        self.audioSources = [];
        if (self.useGainNode === true) {
            self.gainNode = self.audioContext.createGain();
            self.gainNode.connect(self.audioContext.destination);
            self.gainNode.gain.value = 0; // don't hear self
        }
        var audioTracksLength = 0;
        arrayOfMediaStreams.forEach(function (stream) {
            if (!stream.getAudioTracks().length) {
                return;
            }
            audioTracksLength++;
            var audioSource = self.audioContext.createMediaStreamSource(stream);
            if (self.useGainNode === true) {
                audioSource.connect(self.gainNode);
            }
            self.audioSources.push(audioSource);
        });
        if (!audioTracksLength) {
            return;
        }
        self.audioDestination = self.audioContext.createMediaStreamDestination();
        self.audioSources.forEach(function (audioSource) {
            audioSource.connect(self.audioDestination);
        });
        return self.audioDestination.stream;
    }
    function getVideo(stream) {
        var video = document.createElement('video');
        if ('srcObject' in video) {
            video.srcObject = stream;
        }
        else {
            video.src = URL.createObjectURL(stream);
        }
        video.muted = true;
        video.volume = 0;
        video.width = stream.width || self.width || 360;
        video.height = stream.height || self.height || 240;
        video.play();
        return video;
    }
    this.appendStreams = function (streams) {
        if (!streams) {
            throw 'First parameter is required.';
        }
        if (!(streams instanceof Array)) {
            streams = [streams];
        }
        arrayOfMediaStreams.concat(streams);
        streams.forEach(function (stream) {
            if (stream.getVideoTracks().length) {
                var video = getVideo(stream);
                video.stream = stream;
                videos.push(video);
            }
            if (stream.getAudioTracks().length && self.audioContext) {
                var audioSource = self.audioContext.createMediaStreamSource(stream);
                audioSource.connect(self.audioDestination);
                self.audioSources.push(audioSource);
            }
        });
    };
    this.releaseStreams = function () {
        videos = [];
        isStopDrawingFrames = true;
        if (self.gainNode) {
            self.gainNode.disconnect();
            self.gainNode = null;
        }
        if (self.audioSources.length) {
            self.audioSources.forEach(function (source) {
                source.disconnect();
            });
            self.audioSources = [];
        }
        if (self.audioDestination) {
            self.audioDestination.disconnect();
            self.audioDestination = null;
        }
        self.audioContext = null;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (canvas.stream) {
            canvas.stream.stop();
            canvas.stream = null;
        }
    };
    this.resetVideoStreams = function (streams) {
        if (streams && !(streams instanceof Array)) {
            streams = [streams];
        }
        resetVideoStreams(streams);
    };
    function resetVideoStreams(streams) {
        videos = [];
        streams = streams || arrayOfMediaStreams;
        // via: @adrian-ber
        streams.forEach(function (stream) {
            if (!stream.getVideoTracks().length) {
                return;
            }
            var video = getVideo(stream);
            video.stream = stream;
            videos.push(video);
        });
    }
    // for debugging
    this.name = 'MultiStreamsMixer';
    this.toString = function () {
        return this.name;
    };
    this.getMixedStream = getMixedStream;
}
// Last time updated at March 15, 2016
// Latest file can be found here: https://cdn.webrtc-experiment.com/Plugin.EveryWhere.js
// Muaz Khan         - www.MuazKhan.com
// MIT License       - www.WebRTC-Experiment.com/licence
// Source Codes      - https://github.com/muaz-khan/PluginRTC
// _____________________
// Plugin.EveryWhere.js
// Original Source: https://github.com/sarandogou/webrtc-everywhere#downloads
(function () {
    var isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;
    var isEdge = navigator.userAgent.indexOf('Edge') !== -1 && (!!navigator.msSaveOrOpenBlob || !!navigator.msSaveBlob);
    var isIE = !!document.documentMode && !isEdge;
    var isMobileDevice = !!navigator.userAgent.match(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile/i);
    if (typeof cordova !== 'undefined') {
        isMobileDevice = true;
    }
    if (navigator.userAgent.indexOf('Crosswalk') !== -1) {
        isMobileDevice = true;
    }
    if (!(isSafari || isIE) || isMobileDevice)
        return;
    function LoadPluginRTC() {
        window.PluginRTC = {};
        var extractPluginObj = function (elt) {
            return elt.isWebRtcPlugin ? elt : elt.pluginObj;
        };
        var attachEventListener = function (elt, type, listener, useCapture) {
            var _pluginObj = extractPluginObj(elt);
            if (_pluginObj) {
                _pluginObj.bindEventListener(type, listener, useCapture);
            }
            else {
                if (typeof elt.addEventListener !== 'undefined') {
                    elt.addEventListener(type, listener, useCapture);
                }
                else if (typeof elt.addEvent !== 'undefined') {
                    elt.addEventListener('on' + type, listener, useCapture);
                }
            }
        };
        var pluginUID = 'WebrtcEverywherePluginId';
        function getPlugin() {
            return document.getElementById(pluginUID);
        }
        var installPlugin = function () {
            if (document.getElementById(pluginUID)) {
                return;
            }
            var isInternetExplorer = !!((Object.getOwnPropertyDescriptor && Object.getOwnPropertyDescriptor(window, 'ActiveXObject')) || ('ActiveXObject' in window));
            var isSafari = !!navigator.userAgent.indexOf('Safari');
            var pluginObj = document.createElement('object');
            if (isInternetExplorer) {
                pluginObj.setAttribute('classid', 'CLSID:7FD49E23-C8D7-4C4F-93A1-F7EACFA1EC53');
                isInternetExplorer = true;
            }
            else {
                pluginObj.setAttribute('type', 'application/webrtc-everywhere');
            }
            pluginObj.setAttribute('id', pluginUID);
            document.body.appendChild(pluginObj);
            pluginObj.setAttribute('width', '0');
            pluginObj.setAttribute('height', '0');
            if (pluginObj.isWebRtcPlugin || (typeof navigator.plugins !== 'undefined' && (!!navigator.plugins['WebRTC Everywhere'] || navigator.plugins['WebRTC Everywhere Plug-in for Safari']))) {
                if (isInternetExplorer) {
                    webrtcDetectedBrowser = 'Internet Explorer';
                }
                else if (isSafari) {
                    webrtcDetectedBrowser = 'Safari';
                }
            }
        };
        if (document.body) {
            installPlugin();
        }
        else {
            attachEventListener(window, 'load', function () {
                installPlugin();
            });
            attachEventListener(document, 'readystatechange', function () {
                if (document.readyState == 'complete') {
                    installPlugin();
                }
            });
        }
        var getUserMediaDelayed;
        window.PluginRTC.getUserMedia = navigator.getUserMedia = function (constraints, successCallback, errorCallback) {
            if (document.readyState !== 'complete') {
                if (!getUserMediaDelayed) {
                    getUserMediaDelayed = true;
                    attachEventListener(document, 'readystatechange', function () {
                        if (getUserMediaDelayed && document.readyState == 'complete') {
                            getUserMediaDelayed = false;
                            getPlugin().getUserMedia(constraints, successCallback, errorCallback);
                        }
                    });
                }
            }
            else {
                getPlugin().getUserMedia(constraints, successCallback, errorCallback);
            }
        };
        window.PluginRTC.attachMediaStream = function (element, stream) {
            if (!element) {
                return null;
            }
            if (element.isWebRtcPlugin) {
                element.src = stream;
                return element;
            }
            else if (element.nodeName.toLowerCase() === 'video') {
                if (!element.pluginObj && stream) {
                    var _pluginObj = document.createElement('object');
                    var _isIE = (Object.getOwnPropertyDescriptor && Object.getOwnPropertyDescriptor(window, 'ActiveXObject')) || ('ActiveXObject' in window);
                    if (_isIE) {
                        // windowless
                        var windowlessParam = document.createElement('param');
                        windowlessParam.setAttribute('name', 'windowless');
                        windowlessParam.setAttribute('value', true);
                        _pluginObj.appendChild(windowlessParam);
                        _pluginObj.setAttribute('classid', 'CLSID:7FD49E23-C8D7-4C4F-93A1-F7EACFA1EC53');
                    }
                    else {
                        _pluginObj.setAttribute('type', 'application/webrtc-everywhere');
                    }
                    element.pluginObj = _pluginObj;
                    _pluginObj.setAttribute('className', element.className);
                    _pluginObj.setAttribute('innerHTML', element.innerHTML);
                    var width = element.getAttribute('width');
                    var height = element.getAttribute('height');
                    var bounds = element.getBoundingClientRect();
                    if (!width)
                        width = bounds.right - bounds.left;
                    if (!height)
                        height = bounds.bottom - bounds.top;
                    if ('getComputedStyle' in window) {
                        var computedStyle = window.getComputedStyle(element, null);
                        if (!width && computedStyle.width != 'auto' && computedStyle.width != '0px') {
                            width = computedStyle.width;
                        }
                        if (!height && computedStyle.height != 'auto' && computedStyle.height != '0px') {
                            height = computedStyle.height;
                        }
                    }
                    if (width)
                        _pluginObj.setAttribute('width', width);
                    else
                        _pluginObj.setAttribute('autowidth', true);
                    if (height)
                        _pluginObj.setAttribute('height', height);
                    else
                        _pluginObj.setAttribute('autoheight', true);
                    document.body.appendChild(_pluginObj);
                    if (element.parentNode) {
                        element.parentNode.replaceChild(_pluginObj, element); // replace (and remove) element
                        // add element again to be sure any query() will succeed
                        document.body.appendChild(element);
                        element.style.visibility = 'hidden';
                    }
                }
                if (element.pluginObj) {
                    element.pluginObj.bindEventListener('play', function (objvid) {
                        if (element.pluginObj) {
                            if (element.pluginObj.getAttribute('autowidth') && objvid.videoWidth) {
                                element.pluginObj.setAttribute('width', objvid.videoWidth /* + 'px'*/);
                            }
                            if (element.pluginObj.getAttribute('autoheight') && objvid.videoHeight) {
                                element.pluginObj.setAttribute('height', objvid.videoHeight /* + 'px'*/);
                            }
                        }
                    });
                    element.pluginObj.src = stream;
                }
                return element.pluginObj;
            }
            else if (element.nodeName.toLowerCase() === 'audio') {
                return element;
            }
        };
        window.PluginRTC.MediaStreamTrack = {};
        var getSourcesDelayed;
        window.PluginRTC.MediaStreamTrack.getSources = function (gotSources) {
            if (document.readyState !== 'complete') {
                if (!getSourcesDelayed) {
                    getSourcesDelayed = true;
                    attachEventListener(document, 'readystatechange', function () {
                        if (getSourcesDelayed && document.readyState == 'complete') {
                            getSourcesDelayed = false;
                            getPlugin().getSources(gotSources);
                        }
                    });
                }
            }
            else {
                getPlugin().getSources(gotSources);
            }
        };
        window.PluginRTC.RTCPeerConnection = function (configuration, constraints) {
            return getPlugin().createPeerConnection(configuration, constraints);
        };
        window.PluginRTC.RTCIceCandidate = function (RTCIceCandidateInit) {
            return getPlugin().createIceCandidate(RTCIceCandidateInit);
        };
        window.PluginRTC.RTCSessionDescription = function (RTCSessionDescriptionInit) {
            return getPlugin().createSessionDescription(RTCSessionDescriptionInit);
        };
        if (window.onPluginRTCInitialized) {
            window.onPluginRTCInitialized(window.PluginRTC);
        }
    }
    window.addEventListener('load', LoadPluginRTC, false);
})();
function PubNubConnection(connection, connectCallback) {
    function isData(session) {
        return !session.audio && !session.video && !session.screen && session.data;
    }
    var channelId = connection.channel;
    var pub = 'pub-c-3c0fc243-9892-4858-aa38-1445e58b4ecb';
    var sub = 'sub-c-d0c386c6-7263-11e2-8b02-12313f022c90';
    WebSocket = PUBNUB.ws;
    connection.socket = new WebSocket('wss://pubsub.pubnub.com/' + pub + '/' + sub + '/' + channelId);
    connection.socket.onmessage = function (e) {
        var data = JSON.parse(e.data);
        if (data.eventName === connection.socketMessageEvent) {
            onMessagesCallback(data.data);
        }
        if (data.eventName === 'presence') {
            data = data.data;
            if (data.userid === connection.userid)
                return;
            connection.onUserStatusChanged({
                userid: data.userid,
                status: data.isOnline === true ? 'online' : 'offline',
                extra: connection.peers[data.userid] ? connection.peers[data.userid].extra : {}
            });
        }
    };
    connection.socket.onerror = function () {
        if (!connection.enableLogs)
            return;
        console.error('Socket connection is failed.');
    };
    connection.socket.onclose = function () {
        if (!connection.enableLogs)
            return;
        console.warn('Socket connection is closed.');
    };
    connection.socket.onopen = function () {
        if (connection.enableLogs) {
            console.info('PubNub connection is opened.');
        }
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: true
        });
        if (connectCallback)
            connectCallback(connection.socket);
    };
    connection.socket.emit = function (eventName, data, callback) {
        if (!data)
            return;
        if (eventName === 'changed-uuid')
            return;
        if (data.message && data.message.shiftedModerationControl)
            return;
        connection.socket.send(JSON.stringify({
            eventName: eventName,
            data: data
        }));
        if (callback) {
            callback();
        }
    };
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.message.extra) {
            connection.peers[message.sender].extra = message.message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    window.addEventListener('beforeunload', function () {
        if (!connection.socket || !connection.socket.emit)
            return;
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: false
        });
    }, false);
}
// RecordingHandler.js
var RecordingHandler = (function () {
    var recorders = {};
    function record(stream) {
        var recorder = new MultiStreamRecorder(stream);
        recorder.start(5 * 50000 * 500000 * 500000);
        recorders[stream.id] = recorder;
    }
    function stop(stream, callback) {
        if (!recorders[stream.id])
            return;
        var recorder = recorders[stream.id];
        recorder.ondataavailable = callback;
        recorder.stop();
    }
    return {
        record: record,
        stop: stop
    };
})();
// SSEConnection.js
var sseDirPath = 'https://muazkh.com/SSE/';
function SSEConnection(connection, connectCallback) {
    if (connection.socketURL && connection.socketURL !== '/') {
        sseDirPath = connection.socketURL;
    }
    // connection.trickleIce = false;
    connection.socket = new EventSource(sseDirPath + 'SSE.php?me=' + connection.userid);
    var skipDuplicate = {};
    connection.socket.onmessage = function (e) {
        if (skipDuplicate[e.data]) {
            return;
        }
        skipDuplicate[e.data] = true;
        if (!e.data.length)
            return;
        var data = e.data;
        try {
            data = JSON.parse(e.data);
        }
        catch (e) {
            return;
        }
        if (!data)
            return;
        if (data.remoteUserId) {
            if (data.eventName === connection.socketMessageEvent) {
                onMessagesCallback(data.data);
            }
            return;
        }
        Object.keys(data).forEach(function (key) {
            var message = data[key];
            if (!message.length)
                return;
            if (message instanceof Array) {
                message.forEach(function (m) {
                    m = JSON.parse(m);
                    if (!m)
                        return;
                    if (m.eventName === connection.socketMessageEvent) {
                        onMessagesCallback(m.data);
                    }
                });
                return;
            }
            message = JSON.parse(message);
            if (!message)
                return;
            if (message.eventName === connection.socketMessageEvent) {
                onMessagesCallback(message.data);
            }
        });
    };
    connection.socket.emit = function (eventName, data, callback) {
        if (!eventName || !data)
            return;
        if (eventName === 'changed-uuid' || eventName === 'check-presence') {
            return;
        }
        if (data.message && data.message.shiftedModerationControl)
            return;
        if (!data.remoteUserId)
            return;
        var message = JSON.stringify({
            eventName: eventName,
            data: data
        });
        var hr = new XMLHttpRequest();
        hr.open('POST', sseDirPath + 'publish.php');
        var formData = new FormData();
        formData.append('data', message);
        formData.append('sender', connection.userid);
        formData.append('receiver', data.remoteUserId);
        hr.send(formData);
        if (callback) {
            callback();
        }
    };
    connection.socket.onopen = function () {
        if (connectCallback) {
            if (connection.enableLogs) {
                console.info('SSE connection is opened.');
            }
            // this event tries to open json file on server
            connection.socket.emit('fake_EventName', {
                remoteUserId: connection.userid
            });
            connectCallback(connection.socket);
            connectCallback = null;
        }
    };
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.message.extra) {
            connection.peers[message.sender].extra = message.message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    function isData(session) {
        return !session.audio && !session.video && !session.screen && session.data;
    }
}
SSEConnection.checkPresence = function (roomid, callback) {
    callback = callback || function () { };
    if (connection.socketURL && connection.socketURL !== '/') {
        sseDirPath = connection.socketURL;
    }
    var hr = new XMLHttpRequest();
    hr.responseType = 'json';
    hr.response = {
        isRoomExist: false
    };
    hr.addEventListener('load', function () {
        if (connection.enableLogs) {
            console.info('XMLHttpRequest', hr.response);
        }
        callback(hr.response.isRoomExist, roomid);
    });
    hr.addEventListener('error', function () {
        callback(hr.response.isRoomExist, roomid);
    });
    hr.open('GET', sseDirPath + 'checkPresence.php?roomid=' + roomid);
    hr.send();
};
function SignalRConnection(connection, connectCallback) {
    function isData(session) {
        return !session.audio && !session.video && !session.screen && session.data;
    }
    var channelName = connection.channel || 'rmc3';
    connection.socket = {
        send: function (data) {
            hub.server.sendToAll(channelName, JSON.stringify(data));
        }
    };
    var hub = $.connection.geckoHub;
    $.support.cors = true;
    $.connection.hub.url = '/signalr/hubs';
    hub.client.broadcastMessage = function (chName, message) {
        if (chName !== channelName)
            return;
        var data = JSON.parse(message);
        console.log(data);
        if (data.eventName === connection.socketMessageEvent) {
            console.log(connection.socketMessageEvent);
            onMessagesCallback(data.data);
        }
        if (data.eventName === 'presence') {
            data = data.data;
            if (data.userid === connection.userid)
                return;
            connection.onUserStatusChanged({
                userid: data.userid,
                status: data.isOnline === true ? 'online' : 'offline',
                extra: connection.peers[data.userid] ? connection.peers[data.userid].extra : {}
            });
        }
    };
    // start the hub
    $.connection.hub.start();
    setTimeout(function () {
        if (connection.enableLogs) {
            console.info('SignalR connection is opened.');
        }
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: true
        });
        if (connectCallback)
            connectCallback(connection.socket);
    }, 2000);
    connection.socket.emit = function (eventName, data, callback) {
        if (eventName === 'changed-uuid')
            return;
        if (data.message && data.message.shiftedModerationControl)
            return;
        connection.socket.send({
            eventName: eventName,
            data: data
        });
        if (callback) {
            callback();
        }
    };
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.message.extra) {
            connection.peers[message.sender].extra = message.message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    window.addEventListener('beforeunload', function () {
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: false
        });
    }, false);
}
// github.com/muaz-khan/RTCMultiConnection/issues/ => #137 and #706
function SipConnection(connection, connectCallback) {
    function isData(session) {
        return !session.audio && !session.video && !session.screen && session.data;
    }
    connection.socket = {
        send: function (data) {
            var remoteSipURI = data.remoteUserId + '@yourServer.com';
            sip.publish(remoteSipURI, data); // maybe JSON.stringify(data)
        }
    };
    // connect/subscribe to SIP here
    // ref: http://sipjs.com/demo-phone/
    // and: http://sipjs.com/demo-phone/js/ua.js
    var config = {
        userAgentString: 'SIP.js/0.7.0 BB',
        traceSip: true,
        register: false,
        displayName: '',
        uri: '',
        authorizationUser: '',
        password: '',
        wsServers: 'wss://edge.sip.onsip.com'
    };
    var sip = new SIP.UA(config);
    sip.on('invite', function (session) {
        // do the stuff!
    });
    sip.on('message', function (data) {
        data = JSON.parse(data);
        if (data.eventName === connection.socketMessageEvent) {
            onMessagesCallback(data.data);
        }
        if (data.eventName === 'presence') {
            data = data.data;
            if (data.userid === connection.userid)
                return;
            connection.onUserStatusChanged({
                userid: data.userid,
                status: data.isOnline === true ? 'online' : 'offline',
                extra: connection.peers[data.userid] ? connection.peers[data.userid].extra : {}
            });
        }
    });
    // connected or registered
    sip.on('connected', function () {
        if (connection.enableLogs) {
            console.info('SIP connection is opened.');
        }
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: true
        });
        if (connectCallback)
            connectCallback(connection.socket);
    });
    sip.on('unregistered', function () {
        if (!connection.enableLogs)
            return;
        console.warn('Socket connection is closed.');
    });
    connection.socket.emit = function (eventName, data, callback) {
        if (eventName === 'changed-uuid')
            return;
        if (data.message && data.message.shiftedModerationControl)
            return;
        connection.socket.send({
            eventName: eventName,
            data: data
        });
        if (callback) {
            callback(true);
        }
    };
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.message.extra) {
            connection.peers[message.sender].extra = message.message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    window.addEventListener('beforeunload', function () {
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: false
        });
    }, false);
}
// StreamHasData.js
var StreamHasData = (function () {
    function checkIfStreamHasData(mediaElement, successCallback) {
        // chrome for android may have some features missing
        if (DetectRTC.isMobileDevice) {
            return successCallback('success');
        }
        if (!mediaElement.numberOfTimes) {
            mediaElement.numberOfTimes = 0;
        }
        mediaElement.numberOfTimes++;
        if (!(mediaElement.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA || mediaElement.paused || mediaElement.currentTime <= 0)) {
            return successCallback('success');
        }
        if (mediaElement.numberOfTimes >= 60) { // wait 60 seconds while video is delivered!
            return successCallback(false);
        }
        setTimeout(function () {
            checkIfStreamHasData(mediaElement, successCallback);
        }, 900);
    }
    return {
        check: function (stream, callback) {
            if (stream instanceof HTMLMediaElement) {
                checkIfStreamHasData(stream, callback);
                return;
            }
            if (stream instanceof MediaStream) {
                var mediaElement = document.createElement('video');
                mediaElement.muted = true;
                mediaElement.srcObject = stream;
                mediaElement.style.display = 'none';
                (document.body || document.documentElement).appendChild(mediaElement);
                checkIfStreamHasData(mediaElement, callback);
            }
        }
    };
})();
function WebSocketConnection(connection, connectCallback) {
    function isData(session) {
        return !session.audio && !session.video && !session.screen && session.data;
    }
    var channelId = connection.channel;
    connection.socket = new WebSocket('ws://echo.websocket.org');
    connection.socket.onmessage = function (e) {
        var data = JSON.parse(e.data);
        if (data.eventName === connection.socketMessageEvent) {
            onMessagesCallback(data.data);
        }
        if (data.eventName === 'presence') {
            data = data.data;
            if (data.userid === connection.userid)
                return;
            connection.onUserStatusChanged({
                userid: data.userid,
                status: data.isOnline === true ? 'online' : 'offline',
                extra: connection.peers[data.userid] ? connection.peers[data.userid].extra : {}
            });
        }
    };
    connection.socket.onerror = function () {
        if (!connection.enableLogs)
            return;
        console.error('Socket connection is failed.');
    };
    connection.socket.onclose = function () {
        if (!connection.enableLogs)
            return;
        console.warn('Socket connection is closed.');
    };
    connection.socket.onopen = function () {
        if (connection.enableLogs) {
            console.info('PubNub connection is opened.');
        }
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: true
        });
        if (connectCallback)
            connectCallback(connection.socket);
    };
    connection.socket.emit = function (eventName, data, callback) {
        if (eventName === 'changed-uuid')
            return;
        if (data.message && data.message.shiftedModerationControl)
            return;
        connection.socket.send(JSON.stringify({
            eventName: eventName,
            data: data
        }));
        if (callback) {
            callback();
        }
    };
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.message.extra) {
            connection.peers[message.sender].extra = message.message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    window.addEventListener('beforeunload', function () {
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: false
        });
    }, false);
}
function WebSyncConnection(connection, connectCallback) {
    connection.socket = {
        send: function (data) {
            client.publish({
                channel: '/chat',
                data: {
                    username: connection.userid,
                    text: JSON.stringify(data)
                }
            });
        }
    };
    var client = new fm.websync.client('websync.ashx');
    client.setAutoDisconnect({
        synchronous: true
    });
    client.connect({
        onSuccess: function () {
            client.join({
                channel: '/chat',
                userId: connection.userid,
                userNickname: connection.userid,
                onReceive: function (event) {
                    var data = JSON.parse(event.getData().text);
                    if (data.eventName === connection.socketMessageEvent) {
                        onMessagesCallback(data.data);
                    }
                    if (data.eventName === 'presence') {
                        data = data.data;
                        if (data.userid === connection.userid)
                            return;
                        connection.onUserStatusChanged({
                            userid: data.userid,
                            status: data.isOnline === true ? 'online' : 'offline',
                            extra: connection.peers[data.userid] ? connection.peers[data.userid].extra : {}
                        });
                    }
                }
            });
        }
    });
    setTimeout(function () {
        if (connection.enableLogs) {
            console.info('WebSync connection is opened.');
        }
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: true
        });
        if (connectCallback)
            connectCallback(connection.socket);
    }, 2000);
    connection.socket.emit = function (eventName, data, callback) {
        if (eventName === 'changed-uuid')
            return;
        if (data.message && data.message.shiftedModerationControl)
            return;
        connection.socket.send({
            eventName: eventName,
            data: data
        });
        if (callback) {
            callback();
        }
    };
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.extra) {
            connection.peers[message.sender].extra = message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    window.addEventListener('beforeunload', function () {
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: false
        });
    }, false);
}
function XHRConnection(connection, connectCallback) {
    connection.socket = {
        send: function (data) {
            data = {
                message: data,
                sender: connection.userid
            };
            // posting data to server
            // data is also JSON-ified.
            xhr('/Home/PostData', null, JSON.stringify(data));
        }
    };
    // a simple function to make XMLHttpRequests
    function xhr(url, callback, data) {
        if (!window.XMLHttpRequest || !window.JSON)
            return;
        var request = new XMLHttpRequest();
        request.onreadystatechange = function () {
            if (callback && request.readyState == 4 && request.status == 200) {
                // server MUST return JSON text
                callback(JSON.parse(request.responseText));
            }
        };
        request.open('POST', url);
        var formData = new FormData();
        // you're passing "message" parameter
        formData.append('message', data);
        request.send(formData);
    }
    // this object is used to make sure identical messages are not used multiple times
    var messagesReceived = {};
    function repeatedlyCheck() {
        xhr('/Home/GetData', function (data) {
            // if server says nothing; wait.
            if (data == false)
                return setTimeout(repeatedlyCheck, 400);
            // if already receied same message; skip.
            if (messagesReceived[data.ID])
                return setTimeout(repeatedlyCheck, 400);
            messagesReceived[data.ID] = data.Message;
            // "Message" property is JSON-ified in "openSignalingChannel handler
            data = JSON.parse(data.Message);
            if (data.eventName === connection.socketMessageEvent) {
                onMessagesCallback(data.data);
            }
            if (data.eventName === 'presence') {
                data = data.data;
                if (data.userid === connection.userid)
                    return;
                connection.onUserStatusChanged({
                    userid: data.userid,
                    status: data.isOnline === true ? 'online' : 'offline',
                    extra: connection.peers[data.userid] ? connection.peers[data.userid].extra : {}
                });
            }
            // repeatedly check the database
            setTimeout(repeatedlyCheck, 1);
        });
    }
    repeatedlyCheck();
    setTimeout(function () {
        if (connection.enableLogs) {
            console.info('XHR connection is opened.');
        }
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: true
        });
        if (connectCallback)
            connectCallback(connection.socket);
    }, 2000);
    connection.socket.emit = function (eventName, data, callback) {
        if (eventName === 'changed-uuid')
            return;
        if (data.message && data.message.shiftedModerationControl)
            return;
        connection.socket.send({
            eventName: eventName,
            data: data
        });
        if (callback) {
            callback();
        }
    };
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.extra) {
            connection.peers[message.sender].extra = message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
    window.addEventListener('beforeunload', function () {
        connection.socket.emit('presence', {
            userid: connection.userid,
            isOnline: false
        });
    }, false);
}
function enableV2Api(connection) {
    // support sendCustomMessage+onCustomMessage
    if (typeof connection.sendCustomMessage === 'undefined') {
        connection.sendCustomMessage = function (message) {
            connection.socket.emit(connection.socketCustomEvent, message);
        };
        connection.connectSocket(function () {
            connection.socket.on(connection.socketCustomEvent, function (message) {
                if (typeof connection.onCustomMessage === 'function') {
                    connection.onCustomMessage(message);
                }
                else {
                    console.log('onCustomMessage: ' + message);
                }
            });
        });
    }
    // support "connection.streams"
    connection.streams = {};
    (function looper() {
        connection.streams = connection.streamEvents;
        Object.keys(connection.streamEvents).forEach(function (sid) {
            if (connection.streams[sid])
                return;
            var event = connection.streamEvents[sid];
            // http://www.rtcmulticonnection.org/docs/streamEvents/
            // implement selectFirst/selectAll according to v2 API (below)
            connection.streams[sid] = {
                type: event.type,
                stream: event.stream,
                mediaElement: event.mediaElement,
                blobURL: '',
                userid: event.userid,
                exra: event.exra,
                selectFirst: event.selectFirst,
                selectAll: event.selectAll,
                isAudio: event.stream.isAudio,
                isVideo: event.stream.isVideo,
                isScreen: event.stream.isScreen
            };
        });
        Object.keys(connection.peers).forEach(function (uid) {
            if (!connection.peers[uid] || !connection.peers[uid].peer)
                return;
            if (connection.peers[uid].peer.connection)
                return;
            connection.peers[uid].peer.connection = connection.peers[uid].peer;
        });
        setTimeout(looper, 3000);
    })();
    // override open method
    connection.nativeOpen = connection.open;
    connection.open = function () {
        connection.nativeOpen(connection.channel);
    };
    // override join method
    connection.nativeJoin = connection.join;
    connection.join = function () {
        connection.nativeJoin(connection.channel);
    };
    // override connect method
    connection.connect = function () {
        connection.checkPresence(connection.channel, function (isRoomExist) {
            if (isRoomExist === true) {
                connection.join();
                return;
            }
            connection.connect();
        });
    };
    if (connection.session.data && typeof FileBufferReader !== 'undefined') {
        connection.enableFileSharing = true;
    }
    if (!connection.filesContainer) {
        connection.filesContainer = connection.body || document.body || document.documentElement;
    }
    if (!connection.videosContainer) {
        connection.videosContainer = connection.body || document.body || document.documentElement;
    }
    // support "openSignalingChannel"
    connection.setCustomSocketHandler(openSignalingChannel);
}
function openSignalingChannel(connection, connectCallback) {
    function isData(session) {
        return !session.audio && !session.video && !session.screen && session.data;
    }
    connection.socketMessageEvent = 'message';
    console.log('calling openSignalingChannel');
    connection.openSignalingChannel({
        channel: connection.channel,
        callback: function (socket) {
            console.log('Signaling socket is opened.');
            connection.socket = socket;
            if (!connection.socket.emit) {
                connection.socket.emit = function (eventName, data, callback) {
                    if (eventName === 'changed-uuid')
                        return;
                    if (data.message && data.message.shiftedModerationControl)
                        return;
                    console.error('sent', {
                        eventName: eventName,
                        data: data
                    });
                    connection.socket.send({
                        eventName: eventName,
                        data: data
                    });
                    if (callback) {
                        callback();
                    }
                };
            }
            if (connectCallback)
                connectCallback(connection.socket);
        },
        onmessage: function (data) {
            console.error('onmessage', data);
            if (data.eventName === connection.socketMessageEvent) {
                onMessagesCallback(data.data);
            }
        }
    });
    var mPeer = connection.multiPeersHandler;
    function onMessagesCallback(message) {
        if (message.remoteUserId != connection.userid)
            return;
        if (connection.peers[message.sender] && connection.peers[message.sender].extra != message.message.extra) {
            connection.peers[message.sender].extra = message.message.extra;
            connection.onExtraDataUpdated({
                userid: message.sender,
                extra: message.message.extra
            });
        }
        if (message.message.streamSyncNeeded && connection.peers[message.sender]) {
            var stream = connection.streamEvents[message.message.streamid];
            if (!stream || !stream.stream) {
                return;
            }
            var action = message.message.action;
            if (action === 'ended' || action === 'stream-removed') {
                connection.onstreamended(stream);
                return;
            }
            var type = message.message.type != 'both' ? message.message.type : null;
            stream.stream[action](type);
            return;
        }
        if (message.message === 'connectWithAllParticipants') {
            if (connection.broadcasters.indexOf(message.sender) === -1) {
                connection.broadcasters.push(message.sender);
            }
            mPeer.onNegotiationNeeded({
                allParticipants: connection.getAllParticipants(message.sender)
            }, message.sender);
            return;
        }
        if (message.message === 'removeFromBroadcastersList') {
            if (connection.broadcasters.indexOf(message.sender) !== -1) {
                delete connection.broadcasters[connection.broadcasters.indexOf(message.sender)];
                connection.broadcasters = removeNullEntries(connection.broadcasters);
            }
            return;
        }
        if (message.message === 'dropPeerConnection') {
            connection.deletePeer(message.sender);
            return;
        }
        if (message.message.allParticipants) {
            if (message.message.allParticipants.indexOf(message.sender) === -1) {
                message.message.allParticipants.push(message.sender);
            }
            message.message.allParticipants.forEach(function (participant) {
                mPeer[!connection.peers[participant] ? 'createNewPeer' : 'renegotiatePeer'](participant, {
                    localPeerSdpConstraints: {
                        OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    remotePeerSdpConstraints: {
                        OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                        OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                    },
                    isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                    isDataOnly: isData(connection.session)
                });
            });
            return;
        }
        if (message.message.newParticipant) {
            if (message.message.newParticipant == connection.userid)
                return;
            if (!!connection.peers[message.message.newParticipant])
                return;
            mPeer.createNewPeer(message.message.newParticipant, message.message.userPreferences || {
                localPeerSdpConstraints: {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: isData(connection.session)
            });
            return;
        }
        if (message.message.readyForOffer || message.message.addMeAsBroadcaster) {
            connection.addNewBroadcaster(message.sender);
        }
        if (message.message.newParticipationRequest && message.sender !== connection.userid) {
            if (connection.peers[message.sender]) {
                connection.deletePeer(message.sender);
            }
            var userPreferences = {
                extra: message.message.extra || {},
                localPeerSdpConstraints: message.message.remotePeerSdpConstraints || {
                    OfferToReceiveAudio: connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                remotePeerSdpConstraints: message.message.localPeerSdpConstraints || {
                    OfferToReceiveAudio: connection.session.oneway ? !!connection.session.audio : connection.sdpConstraints.mandatory.OfferToReceiveAudio,
                    OfferToReceiveVideo: connection.session.oneway ? !!connection.session.video || !!connection.session.screen : connection.sdpConstraints.mandatory.OfferToReceiveVideo
                },
                isOneWay: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                isDataOnly: typeof message.message.isDataOnly !== 'undefined' ? message.message.isDataOnly : isData(connection.session),
                dontGetRemoteStream: typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way',
                dontAttachLocalStream: !!message.message.dontGetRemoteStream,
                connectionDescription: message,
                successCallback: function () {
                    // if its oneway----- todo: THIS SEEMS NOT IMPORTANT.
                    if (typeof message.message.isOneWay !== 'undefined' ? message.message.isOneWay : !!connection.session.oneway || connection.direction === 'one-way') {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                    if (!!connection.session.oneway || connection.direction === 'one-way' || isData(connection.session)) {
                        connection.addNewBroadcaster(message.sender, userPreferences);
                    }
                }
            };
            connection.onNewParticipant(message.sender, userPreferences);
            return;
        }
        if (message.message.shiftedModerationControl) {
            connection.onShiftedModerationControl(message.sender, message.message.broadcasters);
            return;
        }
        if (message.message.changedUUID) {
            if (connection.peers[message.message.oldUUID]) {
                connection.peers[message.message.newUUID] = connection.peers[message.message.oldUUID];
                delete connection.peers[message.message.oldUUID];
            }
        }
        if (message.message.userLeft) {
            mPeer.onUserLeft(message.sender);
            if (!!message.message.autoCloseEntireSession) {
                connection.leave();
            }
            return;
        }
        mPeer.addNegotiatedMessage(message.message, message.sender);
    }
}
// __________________
// getHTMLMediaElement.js
function getHTMLMediaElement(mediaElement, config) {
    config = config || {};
    if (!mediaElement.nodeName || (mediaElement.nodeName.toLowerCase() != 'audio' && mediaElement.nodeName.toLowerCase() != 'video')) {
        if (!mediaElement.getVideoTracks().length) {
            return getAudioElement(mediaElement, config);
        }
        var mediaStream = mediaElement;
        mediaElement = document.createElement(mediaStream.getVideoTracks().length ? 'video' : 'audio');
        try {
            mediaElement.setAttributeNode(document.createAttribute('autoplay'));
            mediaElement.setAttributeNode(document.createAttribute('playsinline'));
        }
        catch (e) {
            mediaElement.setAttribute('autoplay', true);
            mediaElement.setAttribute('playsinline', true);
        }
        if ('srcObject' in mediaElement) {
            mediaElement.srcObject = mediaStream;
        }
        else {
            mediaElement[!!navigator.mozGetUserMedia ? 'mozSrcObject' : 'src'] = !!navigator.mozGetUserMedia ? mediaStream : (window.URL || window.webkitURL).createObjectURL(mediaStream);
        }
    }
    if (mediaElement.nodeName && mediaElement.nodeName.toLowerCase() == 'audio') {
        return getAudioElement(mediaElement, config);
    }
    var buttons = config.buttons || ['mute-audio', 'mute-video', 'full-screen', 'volume-slider', 'stop'];
    buttons.has = function (element) {
        return buttons.indexOf(element) !== -1;
    };
    config.toggle = config.toggle || [];
    config.toggle.has = function (element) {
        return config.toggle.indexOf(element) !== -1;
    };
    var mediaElementContainer = document.createElement('div');
    mediaElementContainer.className = 'media-container';
    var mediaControls = document.createElement('div');
    mediaControls.className = 'media-controls';
    mediaElementContainer.appendChild(mediaControls);
    if (buttons.has('mute-audio')) {
        var muteAudio = document.createElement('div');
        muteAudio.className = 'control ' + (config.toggle.has('mute-audio') ? 'unmute-audio selected' : 'mute-audio');
        mediaControls.appendChild(muteAudio);
        muteAudio.onclick = function () {
            if (muteAudio.className.indexOf('unmute-audio') != -1) {
                muteAudio.className = muteAudio.className.replace('unmute-audio selected', 'mute-audio');
                mediaElement.muted = false;
                mediaElement.volume = 1;
                if (config.onUnMuted)
                    config.onUnMuted('audio');
            }
            else {
                muteAudio.className = muteAudio.className.replace('mute-audio', 'unmute-audio selected');
                mediaElement.muted = true;
                mediaElement.volume = 0;
                if (config.onMuted)
                    config.onMuted('audio');
            }
        };
    }
    if (buttons.has('mute-video')) {
        var muteVideo = document.createElement('div');
        muteVideo.className = 'control ' + (config.toggle.has('mute-video') ? 'unmute-video selected' : 'mute-video');
        mediaControls.appendChild(muteVideo);
        muteVideo.onclick = function () {
            if (muteVideo.className.indexOf('unmute-video') != -1) {
                muteVideo.className = muteVideo.className.replace('unmute-video selected', 'mute-video');
                mediaElement.muted = false;
                mediaElement.volume = 1;
                mediaElement.play();
                if (config.onUnMuted)
                    config.onUnMuted('video');
            }
            else {
                muteVideo.className = muteVideo.className.replace('mute-video', 'unmute-video selected');
                mediaElement.muted = true;
                mediaElement.volume = 0;
                mediaElement.pause();
                if (config.onMuted)
                    config.onMuted('video');
            }
        };
    }
    if (buttons.has('take-snapshot')) {
        var takeSnapshot = document.createElement('div');
        takeSnapshot.className = 'control take-snapshot';
        mediaControls.appendChild(takeSnapshot);
        takeSnapshot.onclick = function () {
            if (config.onTakeSnapshot)
                config.onTakeSnapshot();
        };
    }
    if (buttons.has('stop')) {
        var stop = document.createElement('div');
        stop.className = 'control stop';
        mediaControls.appendChild(stop);
        stop.onclick = function () {
            mediaElementContainer.style.opacity = 0;
            setTimeout(function () {
                if (mediaElementContainer.parentNode) {
                    mediaElementContainer.parentNode.removeChild(mediaElementContainer);
                }
            }, 800);
            if (config.onStopped)
                config.onStopped();
        };
    }
    var volumeControl = document.createElement('div');
    volumeControl.className = 'volume-control';
    if (buttons.has('record-audio')) {
        var recordAudio = document.createElement('div');
        recordAudio.className = 'control ' + (config.toggle.has('record-audio') ? 'stop-recording-audio selected' : 'record-audio');
        volumeControl.appendChild(recordAudio);
        recordAudio.onclick = function () {
            if (recordAudio.className.indexOf('stop-recording-audio') != -1) {
                recordAudio.className = recordAudio.className.replace('stop-recording-audio selected', 'record-audio');
                if (config.onRecordingStopped)
                    config.onRecordingStopped('audio');
            }
            else {
                recordAudio.className = recordAudio.className.replace('record-audio', 'stop-recording-audio selected');
                if (config.onRecordingStarted)
                    config.onRecordingStarted('audio');
            }
        };
    }
    if (buttons.has('record-video')) {
        var recordVideo = document.createElement('div');
        recordVideo.className = 'control ' + (config.toggle.has('record-video') ? 'stop-recording-video selected' : 'record-video');
        volumeControl.appendChild(recordVideo);
        recordVideo.onclick = function () {
            if (recordVideo.className.indexOf('stop-recording-video') != -1) {
                recordVideo.className = recordVideo.className.replace('stop-recording-video selected', 'record-video');
                if (config.onRecordingStopped)
                    config.onRecordingStopped('video');
            }
            else {
                recordVideo.className = recordVideo.className.replace('record-video', 'stop-recording-video selected');
                if (config.onRecordingStarted)
                    config.onRecordingStarted('video');
            }
        };
    }
    if (buttons.has('volume-slider')) {
        var volumeSlider = document.createElement('div');
        volumeSlider.className = 'control volume-slider';
        volumeControl.appendChild(volumeSlider);
        var slider = document.createElement('input');
        slider.type = 'range';
        slider.min = 0;
        slider.max = 100;
        slider.value = 100;
        slider.onchange = function () {
            mediaElement.volume = '.' + slider.value.toString().substr(0, 1);
        };
        volumeSlider.appendChild(slider);
    }
    if (buttons.has('full-screen')) {
        var zoom = document.createElement('div');
        zoom.className = 'control ' + (config.toggle.has('zoom-in') ? 'zoom-out selected' : 'zoom-in');
        if (!slider && !recordAudio && !recordVideo && zoom) {
            mediaControls.insertBefore(zoom, mediaControls.firstChild);
        }
        else
            volumeControl.appendChild(zoom);
        zoom.onclick = function () {
            if (zoom.className.indexOf('zoom-out') != -1) {
                zoom.className = zoom.className.replace('zoom-out selected', 'zoom-in');
                exitFullScreen();
            }
            else {
                zoom.className = zoom.className.replace('zoom-in', 'zoom-out selected');
                launchFullscreen(mediaElementContainer);
            }
        };
        function launchFullscreen(element) {
            if (element.requestFullscreen) {
                element.requestFullscreen();
            }
            else if (element.mozRequestFullScreen) {
                element.mozRequestFullScreen();
            }
            else if (element.webkitRequestFullscreen) {
                element.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            }
        }
        function exitFullScreen() {
            if (document.fullscreen) {
                document.exitFullscreen();
            }
            if (document.mozFullScreen) {
                document.mozCancelFullScreen();
            }
            if (document.webkitIsFullScreen) {
                document.webkitExitFullscreen();
            }
        }
        function screenStateChange(e) {
            if (e.srcElement != mediaElementContainer)
                return;
            var isFullScreeMode = document.webkitIsFullScreen || document.mozFullScreen || document.fullscreen;
            mediaElementContainer.style.width = (isFullScreeMode ? (window.innerWidth - 20) : config.width) + 'px';
            mediaElementContainer.style.display = isFullScreeMode ? 'block' : 'inline-block';
            if (config.height) {
                mediaBox.style.height = (isFullScreeMode ? (window.innerHeight - 20) : config.height) + 'px';
            }
            if (!isFullScreeMode && config.onZoomout)
                config.onZoomout();
            if (isFullScreeMode && config.onZoomin)
                config.onZoomin();
            if (!isFullScreeMode && zoom.className.indexOf('zoom-out') != -1) {
                zoom.className = zoom.className.replace('zoom-out selected', 'zoom-in');
                if (config.onZoomout)
                    config.onZoomout();
            }
            setTimeout(adjustControls, 1000);
        }
        document.addEventListener('fullscreenchange', screenStateChange, false);
        document.addEventListener('mozfullscreenchange', screenStateChange, false);
        document.addEventListener('webkitfullscreenchange', screenStateChange, false);
    }
    if (buttons.has('volume-slider') || buttons.has('full-screen') || buttons.has('record-audio') || buttons.has('record-video')) {
        mediaElementContainer.appendChild(volumeControl);
    }
    var mediaBox = document.createElement('div');
    mediaBox.className = 'media-box';
    mediaElementContainer.appendChild(mediaBox);
    if (config.title) {
        var h2 = document.createElement('h2');
        h2.innerHTML = config.title;
        h2.setAttribute('style', 'position: absolute;color:white;font-size:17px;text-shadow: 1px 1px black;padding:0;margin:0;text-align: left; margin-top: 10px; margin-left: 10px; display: block; border: 0;line-height:1.5;z-index:1;');
        mediaBox.appendChild(h2);
    }
    mediaBox.appendChild(mediaElement);
    if (!config.width)
        config.width = (innerWidth / 2) - 50;
    mediaElementContainer.style.width = config.width + 'px';
    if (config.height) {
        mediaBox.style.height = config.height + 'px';
    }
    mediaBox.querySelector('video').style.maxHeight = innerHeight + 'px';
    var times = 0;
    function adjustControls() {
        mediaControls.style.marginLeft = (mediaElementContainer.clientWidth - mediaControls.clientWidth - 2) + 'px';
        if (slider) {
            slider.style.width = (mediaElementContainer.clientWidth / 3) + 'px';
            volumeControl.style.marginLeft = (mediaElementContainer.clientWidth / 3 - 30) + 'px';
            if (zoom)
                zoom.style['border-top-right-radius'] = '5px';
        }
        else {
            volumeControl.style.marginLeft = (mediaElementContainer.clientWidth - volumeControl.clientWidth - 2) + 'px';
        }
        volumeControl.style.marginTop = (mediaElementContainer.clientHeight - volumeControl.clientHeight - 2) + 'px';
        if (times < 10) {
            times++;
            setTimeout(adjustControls, 1000);
        }
        else
            times = 0;
    }
    if (config.showOnMouseEnter || typeof config.showOnMouseEnter === 'undefined') {
        mediaElementContainer.onmouseenter = mediaElementContainer.onmousedown = function () {
            adjustControls();
            mediaControls.style.opacity = 1;
            volumeControl.style.opacity = 1;
        };
        mediaElementContainer.onmouseleave = function () {
            mediaControls.style.opacity = 0;
            volumeControl.style.opacity = 0;
        };
    }
    else {
        setTimeout(function () {
            adjustControls();
            setTimeout(function () {
                mediaControls.style.opacity = 1;
                volumeControl.style.opacity = 1;
            }, 300);
        }, 700);
    }
    adjustControls();
    mediaElementContainer.toggle = function (clasName) {
        if (typeof clasName != 'string') {
            for (var i = 0; i < clasName.length; i++) {
                mediaElementContainer.toggle(clasName[i]);
            }
            return;
        }
        if (clasName == 'mute-audio' && muteAudio)
            muteAudio.onclick();
        if (clasName == 'mute-video' && muteVideo)
            muteVideo.onclick();
        if (clasName == 'record-audio' && recordAudio)
            recordAudio.onclick();
        if (clasName == 'record-video' && recordVideo)
            recordVideo.onclick();
        if (clasName == 'stop' && stop)
            stop.onclick();
        return this;
    };
    mediaElementContainer.media = mediaElement;
    return mediaElementContainer;
}
// __________________
// getAudioElement.js
function getAudioElement(mediaElement, config) {
    config = config || {};
    if (!mediaElement.nodeName || (mediaElement.nodeName.toLowerCase() != 'audio' && mediaElement.nodeName.toLowerCase() != 'video')) {
        var mediaStream = mediaElement;
        mediaElement = document.createElement('audio');
        try {
            mediaElement.setAttributeNode(document.createAttribute('autoplay'));
            mediaElement.setAttributeNode(document.createAttribute('controls'));
        }
        catch (e) {
            mediaElement.setAttribute('autoplay', true);
            mediaElement.setAttribute('controls', true);
        }
        if ('srcObject' in mediaElement) {
            mediaElement.mediaElement = mediaStream;
        }
        else {
            mediaElement[!!navigator.mozGetUserMedia ? 'mozSrcObject' : 'src'] = !!navigator.mozGetUserMedia ? mediaStream : (window.URL || window.webkitURL).createObjectURL(mediaStream);
        }
    }
    config.toggle = config.toggle || [];
    config.toggle.has = function (element) {
        return config.toggle.indexOf(element) !== -1;
    };
    var mediaElementContainer = document.createElement('div');
    mediaElementContainer.className = 'media-container';
    var mediaControls = document.createElement('div');
    mediaControls.className = 'media-controls';
    mediaElementContainer.appendChild(mediaControls);
    var muteAudio = document.createElement('div');
    muteAudio.className = 'control ' + (config.toggle.has('mute-audio') ? 'unmute-audio selected' : 'mute-audio');
    mediaControls.appendChild(muteAudio);
    muteAudio.style['border-top-left-radius'] = '5px';
    muteAudio.onclick = function () {
        if (muteAudio.className.indexOf('unmute-audio') != -1) {
            muteAudio.className = muteAudio.className.replace('unmute-audio selected', 'mute-audio');
            mediaElement.muted = false;
            if (config.onUnMuted)
                config.onUnMuted('audio');
        }
        else {
            muteAudio.className = muteAudio.className.replace('mute-audio', 'unmute-audio selected');
            mediaElement.muted = true;
            if (config.onMuted)
                config.onMuted('audio');
        }
    };
    if (!config.buttons || (config.buttons && config.buttons.indexOf('record-audio') != -1)) {
        var recordAudio = document.createElement('div');
        recordAudio.className = 'control ' + (config.toggle.has('record-audio') ? 'stop-recording-audio selected' : 'record-audio');
        mediaControls.appendChild(recordAudio);
        recordAudio.onclick = function () {
            if (recordAudio.className.indexOf('stop-recording-audio') != -1) {
                recordAudio.className = recordAudio.className.replace('stop-recording-audio selected', 'record-audio');
                if (config.onRecordingStopped)
                    config.onRecordingStopped('audio');
            }
            else {
                recordAudio.className = recordAudio.className.replace('record-audio', 'stop-recording-audio selected');
                if (config.onRecordingStarted)
                    config.onRecordingStarted('audio');
            }
        };
    }
    var volumeSlider = document.createElement('div');
    volumeSlider.className = 'control volume-slider';
    volumeSlider.style.width = 'auto';
    mediaControls.appendChild(volumeSlider);
    var slider = document.createElement('input');
    slider.style.marginTop = '11px';
    slider.style.width = ' 200px';
    if (config.buttons && config.buttons.indexOf('record-audio') == -1) {
        slider.style.width = ' 241px';
    }
    slider.type = 'range';
    slider.min = 0;
    slider.max = 100;
    slider.value = 100;
    slider.onchange = function () {
        mediaElement.volume = '.' + slider.value.toString().substr(0, 1);
    };
    volumeSlider.appendChild(slider);
    var stop = document.createElement('div');
    stop.className = 'control stop';
    mediaControls.appendChild(stop);
    stop.onclick = function () {
        mediaElementContainer.style.opacity = 0;
        setTimeout(function () {
            if (mediaElementContainer.parentNode) {
                mediaElementContainer.parentNode.removeChild(mediaElementContainer);
            }
        }, 800);
        if (config.onStopped)
            config.onStopped();
    };
    stop.style['border-top-right-radius'] = '5px';
    stop.style['border-bottom-right-radius'] = '5px';
    var mediaBox = document.createElement('div');
    mediaBox.className = 'media-box';
    mediaElementContainer.appendChild(mediaBox);
    var h2 = document.createElement('h2');
    h2.innerHTML = config.title || 'Audio Element';
    h2.setAttribute('style', 'position: absolute;color: rgb(160, 160, 160);font-size: 20px;text-shadow: 1px 1px rgb(255, 255, 255);padding:0;margin:0;');
    mediaBox.appendChild(h2);
    mediaBox.appendChild(mediaElement);
    mediaElementContainer.style.width = '329px';
    mediaBox.style.height = '90px';
    h2.style.width = mediaElementContainer.style.width;
    h2.style.height = '50px';
    h2.style.overflow = 'hidden';
    var times = 0;
    function adjustControls() {
        mediaControls.style.marginLeft = (mediaElementContainer.clientWidth - mediaControls.clientWidth - 7) + 'px';
        mediaControls.style.marginTop = (mediaElementContainer.clientHeight - mediaControls.clientHeight - 6) + 'px';
        if (times < 10) {
            times++;
            setTimeout(adjustControls, 1000);
        }
        else
            times = 0;
    }
    if (config.showOnMouseEnter || typeof config.showOnMouseEnter === 'undefined') {
        mediaElementContainer.onmouseenter = mediaElementContainer.onmousedown = function () {
            adjustControls();
            mediaControls.style.opacity = 1;
        };
        mediaElementContainer.onmouseleave = function () {
            mediaControls.style.opacity = 0;
        };
    }
    else {
        setTimeout(function () {
            adjustControls();
            setTimeout(function () {
                mediaControls.style.opacity = 1;
            }, 300);
        }, 700);
    }
    adjustControls();
    mediaElementContainer.toggle = function (clasName) {
        if (typeof clasName != 'string') {
            for (var i = 0; i < clasName.length; i++) {
                mediaElementContainer.toggle(clasName[i]);
            }
            return;
        }
        if (clasName == 'mute-audio' && muteAudio)
            muteAudio.onclick();
        if (clasName == 'record-audio' && recordAudio)
            recordAudio.onclick();
        if (clasName == 'stop' && stop)
            stop.onclick();
        return this;
    };
    mediaElementContainer.media = mediaElement;
    return mediaElementContainer;
}
// Last time updated at Sat Jun 25 2016 14:06
// gumadapter.js => github.com/muaz-khan/gumadapter
// https://cdn.webrtc-experiment.com/gumadapter.js
// getUserMedia hacks from git/webrtc/adapter;
// removed redundant codes
// A-to-Zee, all copyrights goes to:
// https://github.com/webrtc/adapter/blob/master/LICENSE.md
var getUserMedia = null;
var webrtcDetectedBrowser = null;
var webrtcDetectedVersion = null;
var webrtcMinimumVersion = null;
var webrtcUtils = window.webrtcUtils || {};
if (!webrtcUtils.enableLogs) {
    webrtcUtils.enableLogs = true;
}
if (!webrtcUtils.log) {
    webrtcUtils.log = function () {
        if (!webrtcUtils.enableLogs) {
            return;
        }
        // suppress console.log output when being included as a module.
        if (typeof module !== 'undefined' ||
            typeof require === 'function' && typeof define === 'function') {
            return;
        }
        console.log.apply(console, arguments);
    };
}
if (!webrtcUtils.extractVersion) {
    webrtcUtils.extractVersion = function (uastring, expr, pos) {
        var match = uastring.match(expr);
        return match && match.length >= pos && parseInt(match[pos], 10);
    };
}
var isBlackBerry = !!(/BB10|BlackBerry/i.test(navigator.userAgent || ''));
if (typeof window === 'object') {
    if (window.HTMLMediaElement &&
        !('srcObject' in window.HTMLMediaElement.prototype)) {
        // Shim the srcObject property, once, when HTMLMediaElement is found.
        Object.defineProperty(window.HTMLMediaElement.prototype, 'srcObject', {
            get: function () {
                // If prefixed srcObject property exists, return it.
                // Otherwise use the shimmed property, _srcObject
                return 'mozSrcObject' in this ? this.mozSrcObject : this._srcObject;
            },
            set: function (stream) {
                if ('mozSrcObject' in this) {
                    this.mozSrcObject = stream;
                }
                else {
                    // Use _srcObject as a private property for this shim
                    this._srcObject = stream;
                    // TODO: revokeObjectUrl(this.src) when !stream to release resources?
                    this.src = stream ? URL.createObjectURL(stream) : null;
                }
            }
        });
    }
    if (!isBlackBerry) {
        // Proxy existing globals
        getUserMedia = window.navigator && window.navigator.getUserMedia;
    }
}
if (typeof window === 'undefined' || !window.navigator) {
    webrtcDetectedBrowser = 'not a browser';
}
else if (isBlackBerry) {
    // skip shim for Blackberry 10+
}
else if (navigator.mozGetUserMedia && window.mozRTCPeerConnection) {
    webrtcDetectedBrowser = 'firefox';
    // the detected firefox version.
    webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent, /Firefox\/([0-9]+)\./, 1);
    // the minimum firefox version still supported by adapter.
    webrtcMinimumVersion = 31;
    // getUserMedia constraints shim.
    getUserMedia = function (constraints, onSuccess, onError) {
        var constraintsToFF37 = function (c) {
            if (typeof c !== 'object' || c.require) {
                return c;
            }
            var require = [];
            Object.keys(c).forEach(function (key) {
                if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
                    return;
                }
                var r = c[key] = (typeof c[key] === 'object') ?
                    c[key] : {
                    ideal: c[key]
                };
                if (r.min !== undefined ||
                    r.max !== undefined || r.exact !== undefined) {
                    require.push(key);
                }
                if (r.exact !== undefined) {
                    if (typeof r.exact === 'number') {
                        r.min = r.max = r.exact;
                    }
                    else {
                        c[key] = r.exact;
                    }
                    delete r.exact;
                }
                if (r.ideal !== undefined) {
                    c.advanced = c.advanced || [];
                    var oc = {};
                    if (typeof r.ideal === 'number') {
                        oc[key] = {
                            min: r.ideal,
                            max: r.ideal
                        };
                    }
                    else {
                        oc[key] = r.ideal;
                    }
                    c.advanced.push(oc);
                    delete r.ideal;
                    if (!Object.keys(r).length) {
                        delete c[key];
                    }
                }
            });
            if (require.length) {
                c.require = require;
            }
            return c;
        };
        if (webrtcDetectedVersion < 38) {
            webrtcUtils.log('spec: ' + JSON.stringify(constraints));
            if (constraints.audio) {
                constraints.audio = constraintsToFF37(constraints.audio);
            }
            if (constraints.video) {
                constraints.video = constraintsToFF37(constraints.video);
            }
            webrtcUtils.log('ff37: ' + JSON.stringify(constraints));
        }
        return navigator.mozGetUserMedia(constraints, onSuccess, onError);
    };
    navigator.getUserMedia = getUserMedia;
    // Shim for mediaDevices on older versions.
    if (!navigator.mediaDevices) {
        navigator.mediaDevices = {
            getUserMedia: requestUserMedia,
            addEventListener: function () { },
            removeEventListener: function () { }
        };
    }
    navigator.mediaDevices.enumerateDevices =
        navigator.mediaDevices.enumerateDevices || function () {
            return new Promise(function (resolve) {
                var infos = [{
                        kind: 'audioinput',
                        deviceId: 'default',
                        label: '',
                        groupId: ''
                    }, {
                        kind: 'videoinput',
                        deviceId: 'default',
                        label: '',
                        groupId: ''
                    }];
                resolve(infos);
            });
        };
    if (webrtcDetectedVersion < 41) {
        // Work around http://bugzil.la/1169665
        var orgEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
        navigator.mediaDevices.enumerateDevices = function () {
            return orgEnumerateDevices().then(undefined, function (e) {
                if (e.name === 'NotFoundError') {
                    return [];
                }
                throw e;
            });
        };
    }
}
else if (navigator.webkitGetUserMedia && window.webkitRTCPeerConnection) {
    webrtcDetectedBrowser = 'chrome';
    webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent, /Chrom(e|ium)\/([0-9]+)\./, 2);
    // the minimum chrome version still supported by adapter.
    webrtcMinimumVersion = 38;
    // getUserMedia constraints shim.
    var constraintsToChrome = function (c) {
        if (typeof c !== 'object' || c.mandatory || c.optional) {
            return c;
        }
        var cc = {};
        Object.keys(c).forEach(function (key) {
            if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
                return;
            }
            var r = (typeof c[key] === 'object') ? c[key] : {
                ideal: c[key]
            };
            if (r.exact !== undefined && typeof r.exact === 'number') {
                r.min = r.max = r.exact;
            }
            var oldname = function (prefix, name) {
                if (prefix) {
                    return prefix + name.charAt(0).toUpperCase() + name.slice(1);
                }
                return (name === 'deviceId') ? 'sourceId' : name;
            };
            if (r.ideal !== undefined) {
                cc.optional = cc.optional || [];
                var oc = {};
                if (typeof r.ideal === 'number') {
                    oc[oldname('min', key)] = r.ideal;
                    cc.optional.push(oc);
                    oc = {};
                    oc[oldname('max', key)] = r.ideal;
                    cc.optional.push(oc);
                }
                else {
                    oc[oldname('', key)] = r.ideal;
                    cc.optional.push(oc);
                }
            }
            if (r.exact !== undefined && typeof r.exact !== 'number') {
                cc.mandatory = cc.mandatory || {};
                cc.mandatory[oldname('', key)] = r.exact;
            }
            else {
                ['min', 'max'].forEach(function (mix) {
                    if (r[mix] !== undefined) {
                        cc.mandatory = cc.mandatory || {};
                        cc.mandatory[oldname(mix, key)] = r[mix];
                    }
                });
            }
        });
        if (c.advanced) {
            cc.optional = (cc.optional || []).concat(c.advanced);
        }
        return cc;
    };
    getUserMedia = function (constraints, onSuccess, onError) {
        if (constraints.audio) {
            constraints.audio = constraintsToChrome(constraints.audio);
        }
        if (constraints.video) {
            constraints.video = constraintsToChrome(constraints.video);
        }
        webrtcUtils.log('chrome: ' + JSON.stringify(constraints));
        return navigator.webkitGetUserMedia(constraints, onSuccess, onError);
    };
    navigator.getUserMedia = getUserMedia;
    if (!navigator.mediaDevices) {
        navigator.mediaDevices = {
            getUserMedia: requestUserMedia
        };
    }
    // A shim for getUserMedia method on the mediaDevices object.
    // TODO(KaptenJansson) remove once implemented in Chrome stable.
    if (!navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia = function (constraints) {
            return requestUserMedia(constraints);
        };
    }
    else {
        // Even though Chrome 45 has navigator.mediaDevices and a getUserMedia
        // function which returns a Promise, it does not accept spec-style
        // constraints.
        var origGetUserMedia = navigator.mediaDevices.getUserMedia.
            bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function (c) {
            webrtcUtils.log('spec:   ' + JSON.stringify(c)); // whitespace for alignment
            c.audio = constraintsToChrome(c.audio);
            c.video = constraintsToChrome(c.video);
            webrtcUtils.log('chrome: ' + JSON.stringify(c));
            return origGetUserMedia(c);
        };
    }
    // Dummy devicechange event methods.
    // TODO(KaptenJansson) remove once implemented in Chrome stable.
    if (typeof navigator.mediaDevices.addEventListener === 'undefined') {
        navigator.mediaDevices.addEventListener = function () {
            webrtcUtils.log('Dummy mediaDevices.addEventListener called.');
        };
    }
    if (typeof navigator.mediaDevices.removeEventListener === 'undefined') {
        navigator.mediaDevices.removeEventListener = function () {
            webrtcUtils.log('Dummy mediaDevices.removeEventListener called.');
        };
    }
}
else if (navigator.mediaDevices && navigator.userAgent.match(/Edge\/(\d+).(\d+)$/)) {
    webrtcUtils.log('This appears to be Edge');
    webrtcDetectedBrowser = 'edge';
    webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent, /Edge\/(\d+).(\d+)$/, 2);
    // the minimum version still supported by adapter.
    webrtcMinimumVersion = 12;
}
else {
    webrtcUtils.log('Browser does not appear to be WebRTC-capable');
}
// Returns the result of getUserMedia as a Promise.
function requestUserMedia(constraints) {
    return new Promise(function (resolve, reject) {
        getUserMedia(constraints, resolve, reject);
    });
}
if (typeof module !== 'undefined') {
    module.exports = {
        getUserMedia: getUserMedia,
        webrtcDetectedBrowser: webrtcDetectedBrowser,
        webrtcDetectedVersion: webrtcDetectedVersion,
        webrtcMinimumVersion: webrtcMinimumVersion,
        webrtcUtils: webrtcUtils
    };
}
else if ((typeof require === 'function') && (typeof define === 'function')) {
    // Expose objects and functions when RequireJS is doing the loading.
    define([], function () {
        return {
            getUserMedia: getUserMedia,
            webrtcDetectedBrowser: webrtcDetectedBrowser,
            webrtcDetectedVersion: webrtcDetectedVersion,
            webrtcMinimumVersion: webrtcMinimumVersion,
            webrtcUtils: webrtcUtils
        };
    });
}
;
if (typeof module !== 'undefined' /* && !!module.exports*/) {
    module.exports = exports = RTCMultiConnection;
}
if (typeof define === 'function' && define.amd) {
    define('RTCMultiConnection', [], function () {
        return RTCMultiConnection;
    });
}

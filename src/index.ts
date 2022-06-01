function Initiator() {
  if (typeof mozRTCPeerConnection !== "undefined") {
    window.RTCIceCandidate = mozRTCIceCandidate;
    window.RTCPeerConnection = mozRTCPeerConnection;
    window.RTCSessionDescription = mozRTCSessionDescription;
    return;
  }
  if (typeof webkitRTCPeerConnection !== "undefined") {
    window.RTCPeerConnection = webkitRTCPeerConnection;
    return;
  }
  throw "WebRTC 1.0 (RTCPeerConnection) API are NOT available in this browser.";
}

Initiator();

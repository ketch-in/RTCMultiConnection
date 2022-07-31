function getIceServers() {
  // resiprocate: 3344+4433
  // pions: 7575
  const iceServers = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun.l.google.com:19302?transport=udp",
      ],
    },
  ];

  return iceServers;
}

export default {
  getIceServers,
};

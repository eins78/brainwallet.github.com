/*
    bitcoinsig.js - sign and verify messages with bitcoin address (public domain)
*/

function msg_bytes(message) {
    var x = message.length;
    return ((x < 0xfd) ? [x] : [0xfd, x & 0xff, x >> 8])
        .concat(Crypto.charenc.UTF8.stringToBytes(message));
}

function msg_digest(message) {
    var b = msg_bytes("Bitcoin Signed Message:\n").concat(msg_bytes(message));
    return Crypto.SHA256(Crypto.SHA256(b, {asBytes:true}), {asBytes:true});
}

function verify_message(address, signature, message) {
    try {
        var sig = Crypto.util.base64ToBytes(signature);
    } catch(err) {
        return false;
    }

    if (sig.length != 65)
        return false;

    // extract r,s from signature
    var r = BigInteger.fromByteArrayUnsigned(sig.slice(1,1+32));
    var s = BigInteger.fromByteArrayUnsigned(sig.slice(33,33+32));

    // get recid
    var compressed = false;
    var nV = sig[0];
    if (nV < 27 || nV >= 35)
        return false;
    if (nV >= 31) {
        compressed = true
        nV -= 4;
    }
    var recid = BigInteger.valueOf(nV - 27);

    var ecparams = getSECCurveByName("secp256k1");
    var curve = ecparams.getCurve();
    var a = curve.getA().toBigInteger();
    var b = curve.getB().toBigInteger();
    var p = curve.getQ();
    var G = ecparams.getG();
    var order = ecparams.getN();

    var BN0 = BigInteger.ZERO;
    var BN1 = BigInteger.ONE;
    var BN2 = BN1.add(BN1);
    var BN4 = BN2.add(BN2);

    var x = r.add(order.multiply(recid.divide(BN2)));
    var alpha = x.multiply(x).multiply(x).add(b).mod(p);
    var beta = alpha.modPow(p.add(BN1).divide(BN4), p);
    var y = beta.subtract(recid).mod(BN2).equals(BN0) ? beta : p.subtract(beta);

    var R = new ECPointFp(curve, curve.fromBigInteger(x), curve.fromBigInteger(y));
    var e = BigInteger.fromByteArrayUnsigned(msg_digest(message));
    var minus_e = e.negate().mod(order);
    var inv_r = r.modInverse(order);
    var Q = (R.multiply(s).add(G.multiply(minus_e))).multiply(inv_r);

    var public_key = Q.getEncoded(compressed);
    var addr = new Bitcoin.Address(Bitcoin.Util.sha256ripe160(public_key));
    return addr.toString() == address.toString();
}

function sign_message(private_key, message, compressed) {
    if (!private_key)
        return false;

    var signature = private_key.sign(msg_digest(message));
    var address = private_key.getBitcoinAddress();

    //convert ASN.1-serialized signature to bitcoin-qt format
    var obj = Bitcoin.ECDSA.parseSig(signature);
    var sequence = [0];
    sequence = sequence.concat(obj.r.toByteArrayUnsigned());
    sequence = sequence.concat(obj.s.toByteArrayUnsigned());

    for (var i = 0; i < 4; i++) {
        var nV = 27 + i;
        if (compressed)
            nV += 4;
        sequence[0] = nV;
        var sig = Crypto.util.bytesToBase64(sequence);
        if (verify_message(address, sig, message))
            return sig;
    }

    return false;
}

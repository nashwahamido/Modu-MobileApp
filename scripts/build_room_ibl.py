# Build the room's interior IBL (a Filament KTX1 bundle) from a Blender-rendered panorama — a pure-python stand-in for Filament's cmgen, which only ships inside a 500+ MB release archive.
#
# Input: a raw float dump of the equirectangular render (little-endian: uint32 w, uint32 h, then w*h RGBA float32 rows BOTTOM-UP, exactly Blender's Image.pixels layout). Produced by a two-line foreach_get in Blender, which sidesteps parsing EXR here.
# Output: a KTX1 cubemap byte-compatible with react-native-filament's bundled RNF_default_env_ibl.ktx — R11F_G11F_B10F faces, 5 mips, and the 9 RGB irradiance spherical harmonics in the "sh" key-value slot, which is what RNF's setIndirectLight actually lights the scene with (ktxreader::Ktx1Bundle::getSphericalHarmonics).
#
# The SH follow filament/IndirectLight.h to the letter: sh[i] = L_i * (1/pi) * C_l, with L_i the radiance projected on the A-scaled real SH basis. The cubemap mips are box-filtered rather than GGX-prefiltered — the shell's materials are all roughness 0.8, where reflections sample the blurriest mips anyway; if the room ever gains mirror-finish decor, regenerate with real cmgen.
#
#   python scripts/build_room_ibl.py <pano.f32> <out_ibl.ktx>
import math
import struct
import sys

FACE_SIZE = 256
MIPS = 5  # 256 down to 16, mirroring the reference bundle

# Real SH basis with filament's A_l^m folded in (signs included), and the per-band C_l * (1/pi) applied at the end.
SH_HAT_C_OVER_PI = [1.0, 2.0943951 / math.pi, 0.785398 / math.pi]


def basis(x, y, z):
    return [
        0.282095,
        -0.488603 * y,
        0.488603 * z,
        -0.488603 * x,
        1.092548 * x * y,
        -1.092548 * y * z,
        0.315392 * (3 * z * z - 1),
        -1.092548 * x * z,
        0.546274 * (x * x - y * y),
    ]


def load_pano(path):
    with open(path, "rb") as f:
        w, h = struct.unpack("<II", f.read(8))
        data = f.read(w * h * 16)
    px = struct.unpack(f"<{w * h * 4}f", data)
    return w, h, px


# u right, v DOWN (v=0 is the image top = straight up). The dump is bottom-up, so sampling flips v.
def sample(w, h, px, u, v):
    x = min(w - 1.0001, max(0.0, u * w - 0.5))
    y = min(h - 1.0001, max(0.0, (1.0 - v) * h - 0.5))
    x0, y0 = int(x), int(y)
    fx, fy = x - x0, y - y0
    out = []
    for c in range(3):
        p00 = px[(y0 * w + x0) * 4 + c]
        p10 = px[(y0 * w + x0 + 1) * 4 + c]
        p01 = px[((y0 + 1) * w + x0) * 4 + c]
        p11 = px[((y0 + 1) * w + x0 + 1) * 4 + c]
        out.append(p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy)
    return out


# World direction for equirect (u, v): +Y up, u=0.5 facing +Z. A horizontal offset here only spins the ambient around the room's four near-identical walls, so exact azimuth registration is uncritical; the vertical axis (ceiling up) is what must be right.
def direction(u, v):
    theta = v * math.pi
    phi = (u - 0.5) * 2 * math.pi
    st = math.sin(theta)
    return st * math.sin(phi), math.cos(theta), st * math.cos(phi)


def compute_sh(w, h, px, stride=4):
    sums = [[0.0, 0.0, 0.0] for _ in range(9)]
    for j in range(0, h, stride):
        v = (j + 0.5) / h
        # Solid angle of one (stride x stride) block of equirect pixels at this row.
        dw = math.sin(v * math.pi) * (math.pi / h) * (2 * math.pi / w) * stride * stride
        row = j * w
        for i in range(0, w, stride):
            r = px[(row + i) * 4]
            g = px[(row + i) * 4 + 1]
            b = px[(row + i) * 4 + 2]
            # The dump is bottom-up: row j is at v-from-bottom, so flip to the v-down convention.
            x, y, z = direction((i + 0.5) / w, 1.0 - v)
            for k, base in enumerate(basis(x, y, z)):
                wgt = base * dw
                sums[k][0] += r * wgt
                sums[k][1] += g * wgt
                sums[k][2] += b * wgt
    bands = [0, 1, 1, 1, 2, 2, 2, 2, 2]
    return [[c * SH_HAT_C_OVER_PI[bands[k]] for c in sums[k]] for k in range(9)]


# GL cubemap face table, KTX order (+X,-X,+Y,-Y,+Z,-Z); (a, b) in [-1, 1] with b growing DOWN the image rows.
def face_direction(face, a, b):
    return [
        (1.0, -b, -a),
        (-1.0, -b, a),
        (a, 1.0, b),
        (a, -1.0, -b),
        (a, -b, 1.0),
        (-a, -b, -1.0),
    ][face]


def render_faces(w, h, px, size):
    faces = []
    for face in range(6):
        data = []
        for row in range(size):
            b = (row + 0.5) / size * 2 - 1
            for col in range(size):
                a = (col + 0.5) / size * 2 - 1
                x, y, z = face_direction(face, a, b)
                ln = math.sqrt(x * x + y * y + z * z)
                x, y, z = x / ln, y / ln, z / ln
                u = 0.5 + math.atan2(x, z) / (2 * math.pi)
                v = math.acos(max(-1.0, min(1.0, y))) / math.pi
                data.append(sample(w, h, px, u, v))
        faces.append(data)
    return faces


def downsample(face, size):
    half = size // 2
    out = []
    for row in range(half):
        for col in range(half):
            i0 = (row * 2) * size + col * 2
            i1 = i0 + size
            out.append([
                (face[i0][c] + face[i0 + 1][c] + face[i1][c] + face[i1 + 1][c]) * 0.25
                for c in range(3)
            ])
    return out


# Scalar float -> unsigned 11/10-bit float (5-bit exponent bias 15, 6/5-bit mantissa), round-to-nearest.
def to_ufloat(value, mantissa_bits):
    if value <= 0 or value != value:
        return 0
    bits = struct.unpack("<I", struct.pack("<f", value))[0]
    exp = ((bits >> 23) & 0xFF) - 127
    mant = bits & 0x7FFFFF
    if exp < -15:
        return 0
    shift = 23 - mantissa_bits
    m = (mant + (1 << (shift - 1))) >> shift
    if m >> mantissa_bits:  # mantissa rounding overflowed into the exponent
        m = 0
        exp += 1
    # Exponent 31 is reserved for inf/NaN in this format, so 30 with a full mantissa is the largest finite value.
    if exp > 15:
        return (30 << mantissa_bits) | ((1 << mantissa_bits) - 1)
    return ((exp + 15) << mantissa_bits) | m


def pack_r11g11b10(rgb):
    r = to_ufloat(rgb[0], 6)
    g = to_ufloat(rgb[1], 6)
    b = to_ufloat(rgb[2], 5)
    return struct.pack("<I", r | (g << 11) | (b << 22))


def main():
    pano_path, out_path = sys.argv[1], sys.argv[2]
    w, h, px = load_pano(pano_path)

    sh = compute_sh(w, h, px)
    sh_text = "\n".join(f"{c[0]:.6g} {c[1]:.6g} {c[2]:.6g}" for c in sh) + "\n"

    mip_faces = [render_faces(w, h, px, FACE_SIZE)]
    size = FACE_SIZE
    for _ in range(MIPS - 1):
        mip_faces.append([downsample(f, size) for f in mip_faces[-1]])
        size //= 2

    # KTX1 header, field-for-field what the RNF reference bundle carries (including its quirk of glType == glInternalFormat == GL_R11F_G11F_B10F).
    kv_pair = b"sh\x00" + sh_text.encode()
    kv = struct.pack("<I", len(kv_pair)) + kv_pair
    kv += b"\x00" * ((4 - len(kv) % 4) % 4)
    header = b"\xabKTX 11\xbb\r\n\x1a\n" + struct.pack(
        "<13I", 0x04030201, 0x8C3A, 1, 0x1907, 0x8C3A, 0x8C3A, FACE_SIZE, FACE_SIZE, 0, 0, 6, MIPS, len(kv),
    )

    out = bytearray(header + kv)
    size = FACE_SIZE
    for mip in mip_faces:
        out += struct.pack("<I", size * size * 4)
        for face in mip:
            for texel in face:
                out += pack_r11g11b10(texel)
        size //= 2

    with open(out_path, "wb") as f:
        f.write(out)
    print(f"sh[0] = {sh[0]}")
    print(f"wrote {out_path}: {len(out)} bytes, {MIPS} mips, {FACE_SIZE}px faces")


if __name__ == "__main__":
    main()

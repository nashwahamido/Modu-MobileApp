import json
import math
import struct
from pathlib import Path


OUT = Path(__file__).with_name("MALM.glb")

W = 0.800
D = 0.480
H = 1.230
BOARD = 0.018
BACK = 0.006
FRONT = 0.019
GAP = 0.006


def vadd(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vcross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def vnorm(v):
    length = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if length == 0:
        return (0, 0, 1)
    return (v[0] / length, v[1] / length, v[2] / length)


def align4(data):
    while len(data) % 4:
        data += b"\x00"
    return data


def align4_json(data):
    while len(data) % 4:
        data += b" "
    return data


class GLB:
    def __init__(self):
        self.buffer = bytearray()
        self.buffer_views = []
        self.accessors = []
        self.meshes = []
        self.nodes = []
        self.materials = []
        self.scenes = [{"nodes": []}]
        self.collections = {}

    def material(self, name, color, metallic=0.0, roughness=0.6):
        index = len(self.materials)
        self.materials.append(
            {
                "name": name,
                "pbrMetallicRoughness": {
                    "baseColorFactor": color,
                    "metallicFactor": metallic,
                    "roughnessFactor": roughness,
                },
            }
        )
        return index

    def _append_bytes(self, data, target):
        offset = len(self.buffer)
        self.buffer.extend(data)
        while len(self.buffer) % 4:
            self.buffer.append(0)
        view_index = len(self.buffer_views)
        self.buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return view_index

    def _accessor(self, data, component_type, type_name, count, mins=None, maxs=None, target=34962):
        view = self._append_bytes(data, target)
        accessor = {"bufferView": view, "componentType": component_type, "count": count, "type": type_name}
        if mins is not None:
            accessor["min"] = [round(x, 6) for x in mins]
            accessor["max"] = [round(x, 6) for x in maxs]
        index = len(self.accessors)
        self.accessors.append(accessor)
        return index

    def add_mesh(self, name, positions, normals, indices, material_index):
        pos_bytes = b"".join(struct.pack("<3f", *p) for p in positions)
        nor_bytes = b"".join(struct.pack("<3f", *n) for n in normals)
        idx_component = 5123 if max(indices, default=0) <= 65535 else 5125
        idx_fmt = "<H" if idx_component == 5123 else "<I"
        idx_bytes = b"".join(struct.pack(idx_fmt, i) for i in indices)
        mins = tuple(min(p[i] for p in positions) for i in range(3))
        maxs = tuple(max(p[i] for p in positions) for i in range(3))
        pos_acc = self._accessor(pos_bytes, 5126, "VEC3", len(positions), mins, maxs)
        nor_acc = self._accessor(nor_bytes, 5126, "VEC3", len(normals))
        idx_acc = self._accessor(idx_bytes, idx_component, "SCALAR", len(indices), target=34963)
        mesh_index = len(self.meshes)
        self.meshes.append(
            {
                "name": name,
                "primitives": [
                    {
                        "attributes": {"POSITION": pos_acc, "NORMAL": nor_acc},
                        "indices": idx_acc,
                        "material": material_index,
                    }
                ],
            }
        )
        node_index = len(self.nodes)
        self.nodes.append({"name": name, "mesh": mesh_index})
        self.scenes[0]["nodes"].append(node_index)

    def write(self, path):
        binary = align4(bytes(self.buffer))
        doc = {
            "asset": {"version": "2.0", "generator": "Codex procedural MALM GLB writer"},
            "scene": 0,
            "scenes": self.scenes,
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "buffers": [{"byteLength": len(binary)}],
            "bufferViews": self.buffer_views,
            "accessors": self.accessors,
        }
        json_bytes = align4_json(json.dumps(doc, separators=(",", ":")).encode("utf-8"))
        total = 12 + 8 + len(json_bytes) + 8 + len(binary)
        with open(path, "wb") as f:
            f.write(struct.pack("<4sII", b"glTF", 2, total))
            f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
            f.write(json_bytes)
            f.write(struct.pack("<I4s", len(binary), b"BIN\x00"))
            f.write(binary)


def box_mesh(loc, dims):
    x, y, z = loc
    sx, sy, sz = (dims[0] / 2, dims[1] / 2, dims[2] / 2)
    corners = {
        "lbf": (x - sx, y - sy, z - sz),
        "rbf": (x + sx, y - sy, z - sz),
        "rtf": (x + sx, y + sy, z - sz),
        "ltf": (x - sx, y + sy, z - sz),
        "lbu": (x - sx, y - sy, z + sz),
        "rbu": (x + sx, y - sy, z + sz),
        "rtu": (x + sx, y + sy, z + sz),
        "ltu": (x - sx, y + sy, z + sz),
    }
    faces = [
        (["rbf", "lbf", "lbu", "rbu"], (0, -1, 0)),
        (["ltf", "rtf", "rtu", "ltu"], (0, 1, 0)),
        (["lbf", "ltf", "ltu", "lbu"], (-1, 0, 0)),
        (["rtf", "rbf", "rbu", "rtu"], (1, 0, 0)),
        (["lbu", "ltu", "rtu", "rbu"], (0, 0, 1)),
        (["lbf", "rbf", "rtf", "ltf"], (0, 0, -1)),
    ]
    positions, normals, indices = [], [], []
    for keys, normal in faces:
        start = len(positions)
        positions.extend(corners[k] for k in keys)
        normals.extend([normal] * 4)
        indices.extend([start, start + 1, start + 2, start, start + 2, start + 3])
    return positions, normals, indices


def cylinder_mesh(loc, radius, depth, axis="z", segments=32):
    positions, normals, indices = [], [], []
    half = depth / 2

    def orient(a, b, c):
        if axis == "x":
            return (loc[0] + c, loc[1] + a, loc[2] + b)
        if axis == "y":
            return (loc[0] + a, loc[1] + c, loc[2] + b)
        return (loc[0] + a, loc[1] + b, loc[2] + c)

    for i in range(segments):
        a0 = 2 * math.pi * i / segments
        a1 = 2 * math.pi * (i + 1) / segments
        p0 = (math.cos(a0) * radius, math.sin(a0) * radius)
        p1 = (math.cos(a1) * radius, math.sin(a1) * radius)
        side_start = len(positions)
        positions.extend([orient(p0[0], p0[1], -half), orient(p1[0], p1[1], -half), orient(p1[0], p1[1], half), orient(p0[0], p0[1], half)])
        n0 = vnorm(orient(p0[0], p0[1], 0))
        n1 = vnorm(orient(p1[0], p1[1], 0))
        center = orient(0, 0, 0)
        normals.extend([vnorm(vsub(positions[side_start], center)), vnorm(vsub(positions[side_start + 1], center)), vnorm(vsub(positions[side_start + 2], center)), vnorm(vsub(positions[side_start + 3], center))])
        indices.extend([side_start, side_start + 1, side_start + 2, side_start, side_start + 2, side_start + 3])
        for cap_z, sign in [(-half, -1), (half, 1)]:
            cap_start = len(positions)
            positions.extend([orient(0, 0, cap_z), orient(p0[0], p0[1], cap_z), orient(p1[0], p1[1], cap_z)])
            normal = (sign, 0, 0) if axis == "x" else (0, sign, 0) if axis == "y" else (0, 0, sign)
            normals.extend([normal] * 3)
            if sign > 0:
                indices.extend([cap_start, cap_start + 1, cap_start + 2])
            else:
                indices.extend([cap_start, cap_start + 2, cap_start + 1])
    return positions, normals, indices


def torus_mesh(loc, major, minor, axis="z", major_segments=32, minor_segments=8):
    positions, normals, indices = [], [], []

    def orient(x, y, z):
        if axis == "x":
            return (loc[0] + z, loc[1] + x, loc[2] + y)
        if axis == "y":
            return (loc[0] + x, loc[1] + z, loc[2] + y)
        return (loc[0] + x, loc[1] + y, loc[2] + z)

    def orient_normal(x, y, z):
        if axis == "x":
            return (z, x, y)
        if axis == "y":
            return (x, z, y)
        return (x, y, z)

    for i in range(major_segments):
        phi = 2 * math.pi * i / major_segments
        for j in range(minor_segments):
            theta = 2 * math.pi * j / minor_segments
            r = major + minor * math.cos(theta)
            x = r * math.cos(phi)
            y = r * math.sin(phi)
            z = minor * math.sin(theta)
            positions.append(orient(x, y, z))
            normals.append(vnorm(orient_normal(math.cos(theta) * math.cos(phi), math.cos(theta) * math.sin(phi), math.sin(theta))))
    for i in range(major_segments):
        for j in range(minor_segments):
            a = i * minor_segments + j
            b = ((i + 1) % major_segments) * minor_segments + j
            c = ((i + 1) % major_segments) * minor_segments + (j + 1) % minor_segments
            d = i * minor_segments + (j + 1) % minor_segments
            indices.extend([a, b, c, a, c, d])
    return positions, normals, indices


def add_box(glb, name, loc, dims, mat):
    glb.add_mesh(name, *box_mesh(loc, dims), mat)


def add_cyl(glb, name, loc, radius, depth, mat, axis="z", segments=32):
    glb.add_mesh(name, *cylinder_mesh(loc, radius, depth, axis, segments), mat)


def add_torus(glb, name, loc, major, minor, mat, axis="z"):
    glb.add_mesh(name, *torus_mesh(loc, major, minor, axis), mat)


def screw(glb, name, loc, axis, length, metal, dark):
    add_cyl(glb, f"{name}_threaded_shaft", loc, 0.0032, length, metal, axis, 18)
    for i in range(6):
        p = list(loc)
        p["xyz".index(axis)] += ((i + 0.5) / 6 - 0.5) * length
        add_torus(glb, f"{name}_thread_ridge_{i + 1:02d}", tuple(p), 0.0034, 0.0004, metal, axis)
    p = list(loc)
    p["xyz".index(axis)] += length / 2 + 0.002
    add_cyl(glb, f"{name}_pan_head", tuple(p), 0.008, 0.004, metal, axis, 28)
    if axis == "z":
        add_box(glb, f"{name}_pozi_slot_a", (p[0], p[1], p[2] + 0.0024), (0.013, 0.002, 0.001), dark)
        add_box(glb, f"{name}_pozi_slot_b", (p[0], p[1], p[2] + 0.0025), (0.002, 0.013, 0.001), dark)
    elif axis == "y":
        add_box(glb, f"{name}_pozi_slot_a", (p[0], p[1] + 0.0024, p[2]), (0.013, 0.001, 0.002), dark)
        add_box(glb, f"{name}_pozi_slot_b", (p[0], p[1] + 0.0025, p[2]), (0.002, 0.001, 0.013), dark)
    else:
        add_box(glb, f"{name}_pozi_slot_a", (p[0] + 0.0024, p[1], p[2]), (0.001, 0.013, 0.002), dark)
        add_box(glb, f"{name}_pozi_slot_b", (p[0] + 0.0025, p[1], p[2]), (0.001, 0.002, 0.013), dark)


def dowel(glb, name, loc, axis, wood):
    add_cyl(glb, name, loc, 0.0048, 0.040, wood, axis, 20)
    for i in range(5):
        p = list(loc)
        p["xyz".index(axis)] += ((i + 1) / 6 - 0.5) * 0.040
        add_torus(glb, f"{name}_grip_ring_{i + 1}", tuple(p), 0.0049, 0.00035, wood, axis)


def cam_lock(glb, name, loc, axis, metal, dark):
    add_cyl(glb, f"{name}_cam_body_120076", loc, 0.011, 0.010, metal, axis, 36)
    add_torus(glb, f"{name}_cam_outer_lip", loc, 0.009, 0.001, metal, axis)
    if axis == "x":
        add_box(glb, f"{name}_cam_drive_slot", (loc[0] + 0.0055, loc[1], loc[2]), (0.001, 0.016, 0.003), dark)
    elif axis == "y":
        add_box(glb, f"{name}_cam_drive_slot", (loc[0], loc[1] + 0.0055, loc[2]), (0.016, 0.001, 0.003), dark)
    else:
        add_box(glb, f"{name}_cam_drive_slot", (loc[0], loc[1], loc[2] + 0.0055), (0.016, 0.003, 0.001), dark)


def cam_bolt(glb, name, loc, axis, metal, dark):
    add_cyl(glb, f"{name}_bolt_shank_118331", loc, 0.0038, 0.035, metal, axis, 20)
    screw(glb, f"{name}_wood_thread_112996", loc, axis, 0.018, metal, dark)
    p = list(loc)
    p["xyz".index(axis)] += 0.024
    add_cyl(glb, f"{name}_mushroom_head", tuple(p), 0.0075, 0.0045, metal, axis, 28)


def rail(glb, name, x, y, z, side, metal, dark):
    length = D - 0.100
    s = -1 if side == "left" else 1
    add_box(glb, f"{name}_fixed_outer_slider_148601", (x, y, z), (0.012, length, 0.020), metal)
    add_box(glb, f"{name}_inner_runner_channel", (x + s * 0.004, y, z), (0.010, length * 0.84, 0.010), metal)
    add_box(glb, f"{name}_drawer_moving_slider_123833", (x + s * 0.013, y - 0.018, z), (0.010, length * 0.76, 0.012), metal)
    for n, yy in enumerate([y - length * 0.34, y + length * 0.34], 1):
        add_cyl(glb, f"{name}_screw_head_{n}_100365", (x + s * 0.007, yy, z + 0.011), 0.0055, 0.0018, metal, "z", 20)
        add_cyl(glb, f"{name}_dark_screw_recess_{n}", (x + s * 0.007, yy, z + 0.0121), 0.0022, 0.0007, dark, "z", 16)
    add_cyl(glb, f"{name}_front_wheel_148601", (x + s * 0.014, y - length * 0.47, z), 0.013, 0.006, metal, "x", 28)
    add_cyl(glb, f"{name}_front_wheel_axle", (x + s * 0.014, y - length * 0.47, z), 0.003, 0.017, dark, "x", 16)


def make_model():
    glb = GLB()
    white = glb.material("white_melamine_satin", [0.93, 0.92, 0.88, 1], 0, 0.62)
    raw = glb.material("unfinished_drawer_board_edges", [0.68, 0.58, 0.43, 1], 0, 0.72)
    wood = glb.material("beech_dowel_wood", [0.78, 0.58, 0.34, 1], 0, 0.68)
    metal = glb.material("zinc_plated_steel", [0.62, 0.62, 0.58, 1], 0.55, 0.38)
    dark = glb.material("dark_recess_shadow", [0.025, 0.023, 0.020, 1], 0, 0.85)

    add_box(glb, "carcass_left_side_panel_118788", (-W / 2 + BOARD / 2, 0, H / 2), (BOARD, D, H), white)
    add_box(glb, "carcass_right_side_panel_118789", (W / 2 - BOARD / 2, 0, H / 2), (BOARD, D, H), white)
    add_box(glb, "carcass_top_panel", (0, 0, H - BOARD / 2), (W, D, BOARD), white)
    add_box(glb, "carcass_bottom_panel", (0, 0, BOARD / 2), (W, D, BOARD), white)
    add_box(glb, "carcass_back_hardboard_panel_110121", (0, D / 2 - BACK / 2, H / 2), (W - 0.020, BACK, H - 0.060), raw)
    add_box(glb, "carcass_front_bottom_plinth", (0, -D / 2 - 0.006, 0.040), (W, 0.026, 0.052), white)
    add_box(glb, "carcass_rear_bottom_plinth", (0, D / 2 - 0.012, 0.040), (W, 0.024, 0.052), white)
    add_box(glb, "top_drawer_center_divider", (0, -0.020, H - 0.145), (BOARD, D - 0.080, 0.205), white)
    for i, z in enumerate([1.005, 0.773, 0.539, 0.305], 1):
        add_box(glb, f"front_horizontal_divider_rail_{i}", (0, -D / 2 - 0.004, z), (W - 0.035, 0.020, 0.024), white)
        add_box(glb, f"rear_horizontal_stretcher_{i}", (0, D / 2 - 0.030, z), (W - 0.050, 0.018, 0.024), white)

    z_top = H - 0.045
    top_h = 0.178
    lower_h = 0.228
    face_w = W - 0.044
    small_w = (face_w - GAP) / 2
    y_front = -D / 2 - FRONT / 2
    rows = []
    z = z_top - top_h / 2
    for label, x in [("left", -small_w / 2 - GAP / 2), ("right", small_w / 2 + GAP / 2)]:
        name = f"drawer01_{label}_small_front"
        add_box(glb, name, (x, y_front, z), (small_w, FRONT, top_h), white)
        add_box(glb, f"{name}_shadow_pull_gap", (x, y_front - 0.010, z + top_h / 2 - 0.011), (small_w - 0.030, 0.004, 0.010), dark)
        rows.append((name, x, z, small_w, top_h, "small"))
    z -= top_h / 2 + GAP + lower_h / 2
    for i in range(4):
        name = f"drawer{i + 3:02d}_wide_front"
        add_box(glb, name, (0, y_front, z), (face_w, FRONT, lower_h), white)
        add_box(glb, f"{name}_shadow_pull_gap", (0, y_front - 0.010, z + lower_h / 2 - 0.011), (face_w - 0.030, 0.004, 0.010), dark)
        rows.append((name, 0, z, face_w, lower_h, "wide"))
        z -= lower_h + GAP

    for i, (_, x, z, width, height, kind) in enumerate(rows, 1):
        name = f"drawer{i:02d}_{kind}_box"
        inner_w = width - 0.050
        depth = D - 0.120
        y = -0.035
        add_box(glb, f"{name}_bottom_101345_grooved_panel", (x, y, z - height * 0.18), (inner_w, depth, 0.006), raw)
        add_box(glb, f"{name}_left_side_panel", (x - inner_w / 2 + BOARD / 2, y, z), (BOARD, depth, height * 0.78), white)
        add_box(glb, f"{name}_right_side_panel", (x + inner_w / 2 - BOARD / 2, y, z), (BOARD, depth, height * 0.78), white)
        add_box(glb, f"{name}_back_panel_110519", (x, y + depth / 2 - BOARD / 2, z), (inner_w, BOARD, height * 0.70), white)
        add_box(glb, f"{name}_rear_cross_rail_123833", (x, y + depth / 2 - 0.006, z + height * 0.38), (inner_w, 0.010, 0.016), white)
        for side, sx in [("left", -1), ("right", 1)]:
            rail(glb, f"{name}_{side}", x + sx * (inner_w / 2 + 0.004), y, z - height * 0.08, side, metal, dark)

    for row, z in enumerate([1.105, 0.895, 0.665, 0.435, 0.205], 1):
        rail(glb, f"carcass_row{row}_left_fixed_slider", -W / 2 + BOARD + 0.010, -0.005, z, "left", metal, dark)
        rail(glb, f"carcass_row{row}_right_fixed_slider", W / 2 - BOARD - 0.010, -0.005, z, "right", metal, dark)

    for side, x in [("left", -W / 2 - 0.002), ("right", W / 2 + 0.002)]:
        for i, zc in enumerate([1.075, 0.865, 0.635, 0.405, 0.175], 1):
            for y in [-0.135, 0.135]:
                cam_lock(glb, f"{side}_side_cam_lock_row{i}_{'front' if y < 0 else 'rear'}", (x, y, zc), "x", metal, dark)
                dowel(glb, f"{side}_side_dowel_101345_row{i}_{'front' if y < 0 else 'rear'}", (x * 0.985, y + 0.040, zc + 0.030), "x", wood)
    for i, x in enumerate([-0.305, -0.185, 0.185, 0.305], 1):
        screw(glb, f"back_panel_nail_110121_top_{i}", (x, D / 2 + 0.004, H - 0.075), "y", 0.016, metal, dark)
        screw(glb, f"back_panel_nail_110121_bottom_{i}", (x, D / 2 + 0.004, 0.085), "y", 0.016, metal, dark)
    for i, x in enumerate([-0.300, -0.180, -0.060, 0.060, 0.180, 0.300], 1):
        add_box(glb, f"front_rail_white_spacer_153548_158568_{i}", (x, -D / 2 - 0.026, 0.075), (0.058, 0.018, 0.014), white)

    for name, x, zc, width, height, _kind in rows:
        left = x - width / 2 + 0.045
        right = x + width / 2 - 0.045
        y = -D / 2 - FRONT - 0.004
        for n, xx in enumerate([left, right], 1):
            cam_bolt(glb, f"{name}_cam_bolt_118331_{n}", (xx, y, zc + height * 0.18), "y", metal, dark)
            cam_lock(glb, f"{name}_cam_lock_120076_{n}", (xx, y + 0.028, zc + height * 0.18), "y", metal, dark)
            dowel(glb, f"{name}_dowel_101345_{n}", (xx, y + 0.018, zc - height * 0.18), "y", wood)
        for n, xx in enumerate([left, right], 1):
            screw(glb, f"{name}_back_screw_110519_{n}", (xx, 0.150, zc - height * 0.05), "y", 0.020, metal, dark)
        screw(glb, f"{name}_bottom_screw_115339_center", (x, 0.115, zc - height * 0.30), "z", 0.014, metal, dark)

    for label, x, sx in [("left", -W / 2 + 0.055, -1), ("right", W / 2 - 0.055, 1)]:
        y = D / 2 + 0.004
        z = H - 0.110
        add_box(glb, f"anti_tip_{label}_wall_leg_102553", (x, y, z + 0.026), (0.003, 0.028, 0.052), metal)
        add_box(glb, f"anti_tip_{label}_cabinet_leg_102553", (x + sx * 0.014, y, z), (0.028, 0.028, 0.003), metal)
        add_cyl(glb, f"anti_tip_{label}_wall_screw_recess", (x, y - 0.0145, z + 0.035), 0.005, 0.0012, dark, "y", 20)
        add_cyl(glb, f"anti_tip_{label}_cabinet_screw_recess", (x + sx * 0.018, y, z + 0.002), 0.005, 0.0012, dark, "z", 20)

    return glb


if __name__ == "__main__":
    model = make_model()
    model.write(OUT)
    print(f"Wrote {OUT}")
    print(f"nodes={len(model.nodes)} meshes={len(model.meshes)} materials={len(model.materials)} bytes={OUT.stat().st_size}")

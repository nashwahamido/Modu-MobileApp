import { BrandId, BrandInfo } from "@/src/game/core/type";

export const BRANDS: Record<BrandId, BrandInfo> = {
  IKEA: {
    name: "IKEA",
    logo: require("../../assets/images/brands/IKEA-Logo.png"),
  },
  Others: {
    name: "Others",
    logo: require("../../assets/images/brands/Others-Logo.png"),
  },
};

/** Resolve a furniture's brand id to its name + logo. */
export const brandFor = (id: BrandId): BrandInfo => BRANDS[id];

import portrait from "../../docs/ip-3d.jpg";
import wecomOfficeMark from "./assets/wecom-office-3d.jpg";

/** The dsh-im 3D portrait (the README head image), inlined as a data URL at build time. */
export const IM_PORTRAIT: string = portrait;
/** The dsh-wecom-office 3D portrait, duplicated into dsh-im because dsh-wecom-office is
 *  host-only. tests/wecom-office-mark.test.ts pins this copy byte-identical to the
 *  canonical plugins/wecom-office/docs/ip-3d.jpg. */
export const WECOM_OFFICE_MARK: string = wecomOfficeMark;

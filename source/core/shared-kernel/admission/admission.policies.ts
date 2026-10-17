import type { AdmissionView } from "./admission.contracts";
import { AdmissionError } from "./admission.errors";

export class AdmissionPolicy {
	static admit(view: AdmissionView | null): AdmissionView {
		if (!view) throw new AdmissionError("not_a_member");
		return view;
	}
}

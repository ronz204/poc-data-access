import { ErrorClassifier } from "./dal.classifier";

export class ViolationTranslator {
	static async translate<T>(operation: PromiseLike<T>, violations: Readonly<Record<string, () => Error>>): Promise<T> {
		try {
			return await operation;
		} catch (error) {
			const failure = ErrorClassifier.classify(error);
			const violation = failure?.constraint ? violations[failure.constraint] : undefined;
			throw violation ? violation() : (failure ?? error);
		}
	}
}

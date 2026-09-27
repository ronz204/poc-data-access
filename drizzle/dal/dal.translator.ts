import { ErrorClassifier } from "@dal/dal.classifier";

export class ViolationTranslator {
	static async translate<T>(
		operation: PromiseLike<T>,
		violations: Readonly<Record<string, () => Error>>,
	): Promise<T> {
		try {
			return await operation;
		} catch (error) {
			const failure = ErrorClassifier.classify(error);
			const translate = failure?.constraint ? violations[failure.constraint] : undefined;
			throw translate ? translate() : (failure ?? error);
		}
	}
}

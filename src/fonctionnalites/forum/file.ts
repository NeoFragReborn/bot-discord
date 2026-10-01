/**
 * Des tâches exécutées l'une après l'autre pour une même clé — un fil Discord —, et en parallèle
 * d'une clé à l'autre.
 *
 * Sur Discord, le message d'ouverture d'un fil et les premières réponses arrivent presque en même
 * temps : sans file, une réponse serait traitée avant que le sujet existe sur le site, et perdue.
 */

export class FileParCle {
    private files = new Map<string, Promise<void>>();

    ajouter(cle: string, tache: () => Promise<void>): Promise<void> {
        const precedente = this.files.get(cle) ?? Promise.resolve();
        const suivante = precedente.then(tache);
        // Une tâche qui échoue ne bloque pas les suivantes ; c'est à l'appelant de traiter l'erreur.
        const gardee = suivante.catch(() => undefined);

        this.files.set(cle, gardee);
        void gardee.then(() => {
            if (this.files.get(cle) === gardee) {
                this.files.delete(cle);
            }
        });

        return suivante;
    }

    get taille(): number {
        return this.files.size;
    }
}

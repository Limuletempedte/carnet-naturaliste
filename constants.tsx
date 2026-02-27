import { TaxonomicGroup } from './types';


export const TAXON_LOGOS: Record<TaxonomicGroup, string> = {
    [TaxonomicGroup.BIRD]: '/Logo/Oiseaux.png',
    [TaxonomicGroup.MAMMAL]: '/Logo/Mammifères.png',
    [TaxonomicGroup.MARINE_MAMMAL]: '/Logo/Mammifères marin.png',
    [TaxonomicGroup.REPTILE]: '/Logo/reptiles.png',
    [TaxonomicGroup.AMPHIBIAN]: '/Logo/Amphibiens.png',
    [TaxonomicGroup.ODONATE]: '/Logo/Odonates.png',
    [TaxonomicGroup.BUTTERFLY]: '/Logo/Papillons de jour.png',
    [TaxonomicGroup.MOTH]: '/Logo/Papillons de nuit.png',
    [TaxonomicGroup.ORTHOPTERA]: '/Logo/Orthoptères.png',
    [TaxonomicGroup.HYMENOPTERA]: '/Logo/Hyménoptères.png',
    [TaxonomicGroup.MANTIS]: '/Logo/Mantes.png',
    [TaxonomicGroup.CICADA]: '/Logo/Cigales.png',
    [TaxonomicGroup.HETEROPTERA]: '/Logo/Punaises.png',
    [TaxonomicGroup.COLEOPTERA]: '/Logo/Coléoptères.png',
    [TaxonomicGroup.NEUROPTERA]: '/Logo/Nevroptères.png',
    [TaxonomicGroup.DIPTERA]: '/Logo/Diptères.png',
    [TaxonomicGroup.PHASMID]: '/Logo/Phasmes.png',
    [TaxonomicGroup.ARACHNID]: '/Logo/Araignées.png',
    [TaxonomicGroup.FISH]: '/Logo/Poissons.png',
    [TaxonomicGroup.CRUSTACEAN]: '/Logo/Crustacés.png',
    [TaxonomicGroup.CHIROPTERA]: '/Logo/Chiroptères.png',
    [TaxonomicGroup.ORCHID]: '/Logo/Orchidées.png',
    [TaxonomicGroup.BOTANY]: '/Logo/Botanique générale.png',
    [TaxonomicGroup.OTHER]: '', // No logo for "Autre"
};

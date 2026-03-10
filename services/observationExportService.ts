import { Observation } from '../types';

export type ObservationExportType = 'json' | 'excel' | 'pdf';

const exportJson = (exportData: Observation[]) => {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'observations.json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const exportExcel = async (exportData: Observation[]) => {
    const XLSX = await import('xlsx');
    const headers = [
        "ID", "Nom de l'espèce", "Nom latin", "Groupe taxonomique", "Date", "Heure",
        "Nombre", "Mâles", "Femelles", "Non identifiés", "Lieu-dit", "Latitude", "Longitude", "Commune", "Département",
        "Pays", "Altitude", "Statut", "Code Atlas", "Protocole", "Sexe", "Age",
        "Condition d'observation", "Comportement", "Commentaire"
    ];

    const data = exportData.map(obs => ({
        ID: obs.id,
        "Nom de l'espèce": obs.speciesName,
        "Nom latin": obs.latinName,
        "Groupe taxonomique": obs.taxonomicGroup,
        Date: obs.date,
        Heure: obs.time,
        Nombre: obs.count,
        "Mâles": obs.maleCount ?? '',
        "Femelles": obs.femaleCount ?? '',
        "Non identifiés": obs.unidentifiedCount ?? '',
        "Lieu-dit": obs.location,
        Latitude: obs.gps.lat ?? '',
        Longitude: obs.gps.lon ?? '',
        Commune: obs.municipality,
        Département: obs.department,
        Pays: obs.country,
        Altitude: obs.altitude ?? '',
        Statut: obs.status,
        "Code Atlas": obs.atlasCode,
        Protocole: obs.protocol,
        Sexe: obs.sexe,
        Age: obs.age,
        "Condition d'observation": obs.observationCondition,
        Comportement: obs.comportement,
        Commentaire: obs.comment
    }));

    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Observations');
    XLSX.writeFile(workbook, 'export_observations.xlsx');
};

const exportPdf = async (exportData: Observation[]) => {
    const { default: jsPDF } = await import('jspdf');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const left = 10;
    const right = pageWidth - 10;
    let y = 12;

    pdf.setFontSize(16);
    pdf.text('Carnet naturaliste - Observations', left, y);
    y += 8;
    pdf.setFontSize(10);
    pdf.text(`Nombre d'observations: ${exportData.length}`, left, y);
    y += 8;

    const formatCountBreakdown = (obs: Observation): string => {
        const hasBreakdown = obs.maleCount !== undefined || obs.femaleCount !== undefined || obs.unidentifiedCount !== undefined;
        if (!hasBreakdown) return 'n/a';
        return `M:${obs.maleCount ?? 0} F:${obs.femaleCount ?? 0} NI:${obs.unidentifiedCount ?? 0}`;
    };

    exportData.forEach((obs, index) => {
        const lines = pdf.splitTextToSize(
            [
                `${index + 1}. ${obs.speciesName} (${obs.latinName || 'Nom latin non renseigné'})`,
                `Date: ${obs.date} ${obs.time || ''} | Nombre: ${obs.count} | Détail: ${formatCountBreakdown(obs)} | Groupe: ${obs.taxonomicGroup}`,
                `Lieu: ${obs.location || 'Lieu non renseigné'} ${obs.municipality ? `(${obs.municipality})` : ''}`,
                `Commentaire: ${obs.comment || 'Aucun'}`
            ].join('\n'),
            right - left
        );

        const blockHeight = lines.length * 5 + 3;
        if (y + blockHeight > pageHeight - 10) {
            pdf.addPage();
            y = 12;
        }

        pdf.text(lines, left, y);
        y += blockHeight;
    });

    pdf.save('carnet-naturaliste-observations.pdf');
};

export const runObservationExport = async (type: ObservationExportType, exportData: Observation[]) => {
    if (type === 'json') {
        exportJson(exportData);
        return;
    }

    if (type === 'excel') {
        await exportExcel(exportData);
        return;
    }

    await exportPdf(exportData);
};

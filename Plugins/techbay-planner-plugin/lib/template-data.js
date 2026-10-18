import templateData from "./templates.json" with { type: "json" };

export const {
  serviceTypeLabels,
  desktopComponentTemplates,
  laptopComponentTemplates,
  desktopOptionalTools,
  laptopOptionalTools,
  defaultCompletionFlags,
} = templateData;

export const getPlannerOptions = (serviceType, deviceType) => {
  const templates =
    deviceType === "desktop"
      ? desktopComponentTemplates
      : laptopComponentTemplates;

  return templates
    .flatMap((component) => {
      const service = component.services[serviceType];
      if (!service) return [];

      return [
        {
          id: `${deviceType}-${component.id}-${serviceType}`,
          componentId: component.id,
          label: component.label,
          description: service.description,
          order: component.order,
          deviceType,
          serviceType,
          steps: service.steps,
        },
      ];
    })
    .sort((first, second) => first.order - second.order);
};

export const desktopDiagnosticOptions = getPlannerOptions(
  "diagnostic",
  "desktop",
);
export const desktopRepairOptions = getPlannerOptions("repair", "desktop");
export const desktopUpgradeOptions = getPlannerOptions("upgrade", "desktop");
export const laptopDiagnosticOptions = getPlannerOptions(
  "diagnostic",
  "laptop",
);
export const laptopRepairOptions = getPlannerOptions("repair", "laptop");
export const laptopUpgradeOptions = getPlannerOptions("upgrade", "laptop");
export const desktopUpdateOptions = getPlannerOptions("update", "desktop");
export const desktopMaintenanceOptions = getPlannerOptions(
  "maintenance",
  "desktop",
);
export const laptopUpdateOptions = getPlannerOptions("update", "laptop");
export const laptopMaintenanceOptions = getPlannerOptions(
  "maintenance",
  "laptop",
);

const getAvailableServiceTypes = (templates) =>
  Object.keys(serviceTypeLabels).filter((serviceType) =>
    templates.some((component) => component.services[serviceType]),
  );

export const serviceTypesByDevice = {
  desktop: getAvailableServiceTypes(desktopComponentTemplates),
  laptop: getAvailableServiceTypes(laptopComponentTemplates),
};

export const plannerOptionsByDevice = {
  desktop: Object.fromEntries(
    Object.keys(serviceTypeLabels).map((serviceType) => [
      serviceType,
      getPlannerOptions(serviceType, "desktop"),
    ]),
  ),
  laptop: Object.fromEntries(
    Object.keys(serviceTypeLabels).map((serviceType) => [
      serviceType,
      getPlannerOptions(serviceType, "laptop"),
    ]),
  ),
};

export const optionalToolsByDevice = {
  desktop: desktopOptionalTools,
  laptop: laptopOptionalTools,
};

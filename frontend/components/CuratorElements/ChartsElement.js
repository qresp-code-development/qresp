import { useContext } from "react";

import ChartsInfoForm from "../CuratorForms/ChartsInfoForm";
import ChartsInfo from "../Paper/Charts";
import { EditAndRemove } from "../Form/Util";

import CuratorContext from "../../Context/Curator/curatorContext";
import Drawer from "../drawer";

import { Typography } from "@material-ui/core";
import SimpleReactLightbox from "simple-react-lightbox";

const ChartsInfoElement = () => {
  const { charts, fileServerPath } = useContext(CuratorContext);

  return (
    <Drawer heading="Add Charts from your paper" defaultOpen={true}>
      <ChartsInfoForm />
      {charts.length > 0 ? (
        <SimpleReactLightbox>
          <ChartsInfo
            charts={charts}
            fileserverpath={fileServerPath}
            showSlider={false}
            inDrawer={false}
            editColumn={[
              {
                label: "Edit/Remove",
                name: "figure",
                view: EditAndRemove,
                options: {
                  align: "center",
                  sort: false,
                  searchable: false,
                  value: null,
                },
              },
            ]}
          />
        </SimpleReactLightbox>
      ) : (
        <Typography
          align="center"
          variant="overline"
          style={{ marginTop: "8px" }}
        >
          No charts added yet
          <br />
          {fileServerPath == ""
            ? "(Please select the server path in the 'Where is the paper' section above)"
            : null}
        </Typography>
      )}
    </Drawer>
  );
};

export default ChartsInfoElement;

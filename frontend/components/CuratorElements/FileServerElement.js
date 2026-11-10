import { useContext, useEffect, useState } from "react";

import { Box, Button, Typography } from "@mui/material";

import FileServerInfoForm from "../CuratorForms/FileServerInfoForm";
import FileServerInfo from "../Paper/FileServer";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import SwitchFade from "../switchFade";
import { CODE_HOSTS, isRepoFilesPath, needsFolder } from "../../Utils/workTypes";

const FileServerElement = () => {
  const { fileServerPath, workType, codeHost } = useContext(CuratorContext);
  const { editing, setEditing } = useContext(CuratorHelperContext);
  // Nothing is required to publish, a folder included: an empty section is
  // finished, not unsaved. Adding a folder opens the form without marking
  // the section unsaved, so leaving it half-done never blocks publishing.
  // (`expected`: whether this kind of record usually has one -- code on
  // GitHub or GitLab does not -- which only changes the wording.)
  const expected = needsFolder(workType, codeHost);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setEditing("fileServerPathInfo", false);
    if (fileServerPath) setAdding(false);
  }, [fileServerPath]);

  return (
    <SwitchFade
      editing={editing.fileServerPathInfo || adding}
      form={
        <Box>
          <FileServerInfoForm
            editor={() => {
              setAdding(false);
              setEditing("fileServerPathInfo", false);
            }}
          />
          <Button
            size="small"
            onClick={() => {
              setAdding(false);
              setEditing("fileServerPathInfo", false);
            }}
            sx={{ mt: 1, textTransform: "none" }}
          >
            {fileServerPath ? "Cancel" : "Not now"}
          </Button>
        </Box>
      }
      display={
        <FileServerInfo
          fileserverpath={fileServerPath}
          editor={() =>
            fileServerPath ? setEditing("fileServerPathInfo", true) : setAdding(true)
          }
          defaultOpen={true}
        >
          {isRepoFilesPath(fileServerPath) && (
            <Typography variant="body2" color="text.secondary" data-testid="fileserver-repo">
              The record&rsquo;s files link to the repository at the commit it was read from.
            </Typography>
          )}
          {!fileServerPath && (
            <Typography variant="body2" color="text.secondary" data-testid="fileserver-not-needed">
              {expected
                ? "No file server folder yet. It is optional; use Edit to add one so the record's figures and files link to it."
                : `Not needed: the code is on ${CODE_HOSTS.repository.label}. ` +
                  "Use Edit to add an RCC folder as well, e.g. for its data or figures."}
            </Typography>
          )}
        </FileServerInfo>
      }
    />
  );
};

export default FileServerElement;

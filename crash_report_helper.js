
const { app } = require('electron')
const electron = require('electron')
const fs = require('fs');
const path = require('path')
var archiver = require('archiver');
var FormData = require('form-data')
var http = require('http')
var https = require('https')


var form = new FormData({ maxDataSize: 20971520 });

module.exports = {

    // ��������ʱ����dmp�ļ�����������ñ������������ʱ������������ļ�
    // ���ɵ�·��Ϊ tmp Ŀ¼�£���CrashesĿ¼���ļ�����: app.getPath("temp") + "/" + app.getName() + " Crashes"
    genDmpFileIfCrashed: function () {
        electron.crashReporter.start({
            companyName: '',
            submitURL: "",
            uploadToServer: false // ���Զ��ύ�����񵽱����󣬳����������ļ�����־�ļ�Ȼ�����Լ��ύ
        })
    },
    
    // ����dirĿ¼�º�׺��Ϊ.dmp���ļ�
    // ���ݹ������Ŀ¼
    findAllDmpFiles: function (dir) {
        try {
            var results = []
            var list = fs.readdirSync(dir)
            list.forEach(function (file) {
                file = dir + '/' + file
                var stat = fs.statSync(file)
                if (stat && !stat.isDirectory() && path.extname(file) == ".dmp") {
                    results.push(file)
                }
            })
            return results
        } catch (err) {
            return []
        }
    },
    // ����zego����־�ļ�
    // dir - zego sdk ����־λ�ã���дͨ��setLogDir���õ���־·��
    findZegoLogs: function (dir) {
        try {
            var results = []
            var list = fs.readdirSync(dir)
            list.forEach(function (file) {
                if (file == "zegoavlog1.txt"
                    || file == "zegoavlog2.txt"
                    || file == "zegoavlog3.txt"
                    || file == "zegoscreencaplog1.txt"
                    || file == "zegoscreencaplog2.txt"
                    || file == "zegoscreencaplog3.txt") {
                    file = dir + '/' + file
                    results.push(file)
                }
            })
            return results
        } catch (err) {
            return []
        }
    },
    // ѹ���ļ�Ϊzip
    // src_file_list - Ҫѹ����Դ�ļ�����
    // output_zip_file - ѹ�����ѹ�����ļ�·�����ļ���
    // call_back - ѹ�������ص� 0 - �ɹ� �� -1 ʧ��
    archiverFiles: function (src_file_list, output_zip_file, call_back) {
        var output = fs.createWriteStream(output_zip_file);
        var archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });
        // listen for all archive data to be written
        // 'close' event is fired only when a file descriptor is involved
        output.on('close', function () {
            //console.log(archive.pointer() + ' total bytes');
            //console.log('archiver has been finalized and the output file descriptor has closed.');
            if (call_back) {
                call_back(0)
            }            
        });

        // This event is fired when the data source is drained no matter what was the data source.
        // It is not part of this library but rather from the NodeJS Stream API.
        // @see: https://nodejs.org/api/stream.html#stream_event_end
        output.on('end', function () {
            console.log('Data has been drained');
            if (call_back) {
                call_back(-1)
            }
        });

        // good practice to catch warnings (ie stat failures and other non-blocking errors)
        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                // log warning
            } else {
                if (call_back) {
                    call_back(-1)
                }
            }
        });

        // good practice to catch this error explicitly
        archive.on('error', function (err) {
            
            if (call_back) {
                call_back(-1)
            }
        });

        // pipe archive data to the file
        archive.pipe(output);

        // append a file from stream
        for (i in src_file_list) {
            var file = src_file_list[i];
            archive.append(fs.createReadStream(file), { name: path.basename(file) });
        }
        archive.finalize();

    },

    // file_to_upload - Ҫ�ϴ���dmp����־�ļ�
    // protocol - http: ����https:
    // host - breakpad ������ip��������
    // port - breakpad �������˿�
    // path - ��������·��
    // call_back - �ϴ������ص� 0 - �ɹ� �� -1 ʧ��
    uploadToBreakPadServer: function (file_to_upload, protocol, host, port, path, call_back) {

        form.append('upload_file_minidump', fs.createReadStream(file_to_upload), 'dmpfile');
        form.append('_companyName', '');              // ��˾����
        form.append('_productName', app.getName());   // App ��Ʒ����
        form.append('ver', process.versions.electron);// Electron �汾��
        form.append('_version', app.getVersion());    // App �汾��
        form.append('platform', process.platform);    // ƽ̨��Ϣ
        form.append('comments', "dmp file and log zip file");  // ע����Ϣ

        var http_module = http
        if (protocol == "http:") {
            http_module = http
        } else {
            http_module = https
        }
        try
        {
        var request = http_module.request(
            {
                method: 'post',
                protocol: protocol,
                host: host,
                port: port,
                path: path,
                headers: form.getHeaders()
            }
        )

        form.pipe(request)

        request.on('response', function (res) {
            console.log(res.statusCode);
            if (res.statusCode == 200) {
                if (call_back) {
                    call_back(0)
                }
            } else {
                if (call_back) {
                    call_back(-1)
                }
            }
        });            
            
        }catch(err)
        {
            console.log(err)
        }

    },

    // ɾ���ļ�
    // file_path - Ҫɾ�����ļ�·��
    removeFile: function (file_path) {
        fs.unlink(file_path, (err) => {
            if (err) throw err;
            //console.log('successfully deleted ', del_file);
        });
    },

    // dmp_file_dir - dmp Ŀ¼ Electron ����dmp�ļ���Ŀ¼Ĭ��Ϊ app.getPath("temp") + "/" + app.getName() + " Crashes"
    // zego_log_dir - zego sdk log Ŀ¼��Ҫ��setLogDirһ��
    // tmp_zip_path - ��ʱѹ�����ļ���ѹ��dmp�ļ�����־�ļ���ѹ����
    // upload_server.protocol  - ��������Э�� http: ���� https:
    // upload_server.host  - ������ip��������
    // upload_server.port  - �������˿ں�
    // upload_server.path  - ����·��
    searchDmpFileAndUpload : function({dmp_file_dir, zego_log_dir, tmp_zip_path, upload_server/*:{ protocol, host, port, path }*/})
    {
        // ����dmp�ļ�
        dmp_file_lists = this.findAllDmpFiles(dmp_file_dir);
        
        if(dmp_file_lists.length <= 0)
        {
            // û��dmp�ļ�������
            return;
        }

        zego_log_lists = this.findZegoLogs(zego_log_dir)

        // �û���Ҫ �� dmp_file_lists �� zego_log_lists���ļ��ϴ���������
        // �ϴ��ɹ��󣬰ѱ���dmp�ļ��ļ�ɾ������������dmp_file_lists ɾ������dmp�ļ���
        // ѹ�� dmp_file_lists �� zego_log_lists ���ϴ�
        output_to_zip_files = dmp_file_lists.concat(zego_log_lists)
        
        server_config = upload_server

        //ѹ��dmp�ļ�����־�ļ�
        this.archiverFiles(output_to_zip_files, tmp_zip_path , (function (error) {
            if (error == 0) {
                // �ϴ�ѹ�����dmp�ļ�����־�ļ�
                this.uploadToBreakPadServer(tmp_zip_path, server_config.protocol, server_config.host, server_config.port, server_config.path, (function (error_code) {
                    if (error_code == 0) {
                        // �ϴ��ɹ���ɾ�����ص�dmp�ļ�����־�ļ�
                        this.removeFile(tmp_zip_path)
                        for (i in output_to_zip_files) {
                            this.removeFile(output_to_zip_files[i])
                        }
                    }
                }).bind(this))
            }
        }).bind(this))
    }
}
